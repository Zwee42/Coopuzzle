import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { DragState, ServerMessage } from "../shared/protocol";
import { isPointOnBoard, isDropNearSlot, parsePieceId } from "../shared/puzzle";
import { hashToken, normalizeRoomCode, roomDto } from "./session";
import { playerDto } from "./session";
import type { RoomStore, StoredRoom } from "./store";

interface Connection {
  ws: WebSocket;
  socketId: string;
  roomId: string | null;
  playerId: string | null;
  isAlive: boolean;
  authTimer: NodeJS.Timeout | null;
  windowStarted: number;
  messageCount: number;
}

interface Lock {
  playerId: string;
  socketId: string;
}

interface RoomRuntime {
  sockets: Set<WebSocket>;
  locks: Map<string, Lock>;
  drags: Map<string, DragState>;
  cursors: Map<string, { x: number; y: number }>;
  version: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringField(message: JsonRecord, field: string): string | null {
  const value = message[field];
  return typeof value === "string" ? value : null;
}

function versionField(message: JsonRecord): number | null {
  const value = message.version;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function coordinateFields(message: JsonRecord): { x: number; y: number } | null {
  const x = message.x;
  const y = message.y;
  if (typeof x !== "number" || typeof y !== "number" || !isPointOnBoard(x, y)) return null;
  return { x, y };
}

export class RealtimeHub {
  private readonly store: RoomStore;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
  private readonly connections = new Map<WebSocket, Connection>();
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(store: RoomStore) {
    this.store = store;
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.heartbeat = setInterval(() => this.heartbeatTick(), 30_000);
    this.heartbeat.unref?.();
  }

  attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      let pathname = "";
      try {
        pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (pathname !== "/ws") {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });
  }

  isPlayerOnline(playerId: string): boolean {
    for (const connection of this.connections.values()) {
      if (connection.playerId === playerId) return true;
    }
    return false;
  }

  /** Called after an HTTP join so already-connected clients see the new member. */
  roomMembershipChanged(roomId: string): void {
    this.announcePlayers(roomId);
  }

  puzzleChanged(roomId: string): void {
    const room = this.store.getRoomById(roomId);
    if (!room) return;
    const runtime = this.getRuntime(room);
    runtime.version = room.version;
    runtime.locks.clear();
    runtime.drags.clear();

    const players = this.playersFor(room);
    this.broadcast(roomId, {
      type: "puzzle_started",
      room: roomDto(room, 0),
      players,
    });
  }

  roomDeleted(roomId: string): void {
    this.broadcast(roomId, { type: "room_deleted" });
    const runtime = this.rooms.get(roomId);
    this.rooms.delete(roomId);
    if (runtime) {
      for (const ws of runtime.sockets) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.close(4001, "Room deleted");
        }, 50);
      }
    }
  }

  dispose(): void {
    clearInterval(this.heartbeat);
    for (const ws of this.connections.keys()) {
      try {
        ws.close(1001, "Server shutting down");
      } catch {
        // Already closed.
      }
    }
    this.wss.close();
  }

  private getRuntime(room: StoredRoom): RoomRuntime {
    let runtime = this.rooms.get(room.id);
    if (!runtime) {
      runtime = {
        sockets: new Set(),
        locks: new Map(),
        drags: new Map(),
        cursors: new Map(),
        version: room.version,
      };
      this.rooms.set(room.id, runtime);
    }
    if (runtime.version !== room.version) {
      runtime.version = room.version;
      runtime.locks.clear();
      runtime.drags.clear();
    }
    return runtime;
  }

  private handleConnection(ws: WebSocket): void {
    const connection: Connection = {
      ws,
      socketId: crypto.randomUUID(),
      roomId: null,
      playerId: null,
      isAlive: true,
      authTimer: null,
      windowStarted: Date.now(),
      messageCount: 0,
    };
    this.connections.set(ws, connection);

    connection.authTimer = setTimeout(() => {
      if (!connection.playerId) ws.close(4401, "Hello required");
    }, 10_000);
    connection.authTimer.unref?.();

    ws.on("pong", () => {
      connection.isAlive = true;
    });

    ws.on("message", (data) => {
      this.handleMessage(connection, data);
    });

    ws.on("close", () => {
      if (connection.authTimer) clearTimeout(connection.authTimer);
      this.handleClose(connection);
    });

    ws.on("error", () => {
      // close follows
    });
  }

  private handleMessage(connection: Connection, data: RawData): void {
    const now = Date.now();
    if (now - connection.windowStarted > 1000) {
      connection.windowStarted = now;
      connection.messageCount = 0;
    }
    connection.messageCount++;
    if (connection.messageCount > 160) {
      connection.ws.close(1008, "Too many messages");
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      this.sendError(connection, "bad_message", "That message was not valid JSON.");
      return;
    }
    const message = record(payload);
    if (!message) {
      this.sendError(connection, "bad_message", "That message was not valid.");
      return;
    }
    const type = message.type;
    if (typeof type !== "string") {
      this.sendError(connection, "bad_message", "That message had no type.");
      return;
    }

    if (!connection.playerId) {
      if (type !== "hello") {
        this.sendError(connection, "not_joined", "Say hello before changing the puzzle.");
        return;
      }
      this.handleHello(connection, message);
      return;
    }

    switch (type) {
      case "grab_piece":
        this.handleGrab(connection, message);
        break;
      case "release_piece":
        this.handleRelease(connection, message);
        break;
      case "drag_piece":
        this.handleDrag(connection, message);
        break;
      case "drag_off":
        this.handleDragOff(connection, message);
        break;
      case "place_piece":
        this.handlePlace(connection, message);
        break;
      case "cursor":
        this.handleCursor(connection, message);
        break;
      case "hello":
        this.sendError(connection, "already_joined", "You are already in this room.");
        break;
      default:
        this.sendError(connection, "bad_message", "That message type is not supported.");
    }
  }

  private handleHello(connection: Connection, message: JsonRecord): void {
    const rawCode = stringField(message, "code");
    const token = stringField(message, "token");
    if (!rawCode || !token) {
      this.sendError(connection, "bad_hello", "Room code and session token are required.");
      connection.ws.close(4401, "Unauthorized");
      return;
    }
    const room = this.store.getRoomByCode(normalizeRoomCode(rawCode));
    if (!room) {
      this.sendError(connection, "room_not_found", "That room could not be found.");
      connection.ws.close(4404, "Room not found");
      return;
    }
    const player = this.store.getPlayerByToken(room.id, hashToken(token));
    if (!player) {
      this.sendError(connection, "not_authorized", "Your room session has expired.");
      connection.ws.close(4401, "Unauthorized");
      return;
    }

    if (connection.authTimer) {
      clearTimeout(connection.authTimer);
      connection.authTimer = null;
    }
    connection.roomId = room.id;
    connection.playerId = player.id;

    const runtime = this.getRuntime(room);
    runtime.sockets.add(connection.ws);

    this.send(connection, this.snapshot(room, player.id));
    this.announcePlayers(room.id);
  }

  private handleGrab(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const pieceId = stringField(message, "pieceId");
    const version = versionField(message);
    if (!pieceId || version === null) {
      this.sendError(connection, "bad_piece", "That piece could not be read.");
      return;
    }
    if (version !== context.room.version) {
      this.sendError(connection, "stale", "The puzzle has changed. Please try again.");
      return;
    }
    const position = parsePieceId(pieceId, context.room.rows, context.room.cols);
    if (!position) {
      this.sendError(connection, "bad_piece", "That piece does not exist.");
      return;
    }

    const placed = this.store.getPlacements(context.room.id, context.room.version);
    if (placed.some((entry) => entry.pieceId === pieceId)) {
      this.sendError(connection, "already_placed", "That piece is already home.");
      return;
    }

    const runtime = this.getRuntime(context.room);
    const existing = runtime.locks.get(pieceId);
    if (existing) {
      if (existing.socketId === connection.socketId) return;
      const holder = this.store.getPlayerById(existing.playerId);
      this.sendError(
        connection,
        "piece_busy",
        `${holder?.name ?? "Your partner"} is holding that piece.`,
        pieceId,
      );
      return;
    }

    runtime.locks.set(pieceId, {
      playerId: connection.playerId!,
      socketId: connection.socketId,
    });
    runtime.drags.delete(pieceId);
    this.broadcast(context.room.id, {
      type: "piece_grabbed",
      pieceId,
      playerId: connection.playerId!,
    });
  }

  private handleRelease(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const pieceId = stringField(message, "pieceId");
    if (!pieceId) return;
    this.releaseLock(context.room, context.runtime, pieceId, connection.socketId, "cancelled");
  }

  private handleDrag(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const pieceId = stringField(message, "pieceId");
    const version = versionField(message);
    const point = coordinateFields(message);
    if (!pieceId || version === null || !point) return;
    if (version !== context.room.version) return;
    const lock = context.runtime.locks.get(pieceId);
    if (!lock || lock.socketId !== connection.socketId) return;

    context.runtime.drags.set(pieceId, {
      playerId: connection.playerId!,
      x: point.x,
      y: point.y,
    });
    this.broadcast(context.room.id, {
      type: "piece_drag",
      pieceId,
      playerId: connection.playerId!,
      x: point.x,
      y: point.y,
    });
  }

  private handleDragOff(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const pieceId = stringField(message, "pieceId");
    const version = versionField(message);
    if (!pieceId || version === null || version !== context.room.version) return;
    const lock = context.runtime.locks.get(pieceId);
    if (!lock || lock.socketId !== connection.socketId) return;
    context.runtime.drags.delete(pieceId);
    this.broadcast(context.room.id, {
      type: "piece_drag_off",
      pieceId,
    });
  }

  private handlePlace(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const pieceId = stringField(message, "pieceId");
    const version = versionField(message);
    const point = coordinateFields(message);
    if (!pieceId || version === null || !point) {
      this.sendError(connection, "bad_piece", "That drop could not be read.");
      return;
    }
    if (version !== context.room.version) {
      this.sendError(connection, "stale", "The puzzle has changed. Please try again.");
      return;
    }
    const position = parsePieceId(pieceId, context.room.rows, context.room.cols);
    if (!position) {
      this.sendError(connection, "bad_piece", "That piece does not exist.");
      return;
    }
    const lock = context.runtime.locks.get(pieceId);
    if (!lock || lock.socketId !== connection.socketId) {
      this.sendError(connection, "not_holding", "You are no longer holding that piece.", pieceId);
      return;
    }

    if (!isDropNearSlot(point, position, context.room.rows, context.room.cols)) {
      this.releaseLock(context.room, context.runtime, pieceId, connection.socketId, "missed");
      return;
    }

    const placedCount = this.store.placePiece(
      context.room.id,
      context.room.version,
      pieceId,
      connection.playerId!,
      Date.now(),
    );
    context.runtime.locks.delete(pieceId);
    context.runtime.drags.delete(pieceId);
    const complete = placedCount >= context.room.rows * context.room.cols;

    this.broadcast(context.room.id, {
      type: "piece_placed",
      pieceId,
      playerId: connection.playerId!,
      placedCount,
      version: context.room.version,
      complete,
    });
  }

  private handleCursor(connection: Connection, message: JsonRecord): void {
    const context = this.context(connection);
    if (!context) return;
    const point = coordinateFields(message);
    if (!point) return;
    context.runtime.cursors.set(connection.playerId!, point);
    this.broadcast(
      context.room.id,
      {
        type: "cursor",
        playerId: connection.playerId!,
        x: point.x,
        y: point.y,
      },
      connection.ws,
    );
  }

  private handleClose(connection: Connection): void {
    this.connections.delete(connection.ws);
    if (!connection.roomId) return;
    const room = this.store.getRoomById(connection.roomId);
    const runtime = this.rooms.get(connection.roomId);
    if (!runtime) return;
    runtime.sockets.delete(connection.ws);

    if (room) {
      for (const [pieceId, lock] of [...runtime.locks.entries()]) {
        if (lock.socketId === connection.socketId) {
          runtime.locks.delete(pieceId);
          runtime.drags.delete(pieceId);
          this.broadcast(room.id, {
            type: "piece_released",
            pieceId,
            playerId: connection.playerId!,
            reason: "disconnected",
          });
        }
      }
      this.announcePlayers(room.id);
    }

    if (runtime.sockets.size === 0) {
      this.rooms.delete(connection.roomId);
    }
  }

  private releaseLock(
    room: StoredRoom,
    runtime: RoomRuntime,
    pieceId: string,
    socketId: string,
    reason: "cancelled" | "missed",
  ): void {
    const lock = runtime.locks.get(pieceId);
    if (!lock || lock.socketId !== socketId) return;
    runtime.locks.delete(pieceId);
    runtime.drags.delete(pieceId);
    this.broadcast(room.id, {
      type: "piece_released",
      pieceId,
      playerId: lock.playerId,
      reason,
    });
  }

  private context(connection: Connection): { room: StoredRoom; runtime: RoomRuntime } | null {
    if (!connection.roomId) return null;
    const room = this.store.getRoomById(connection.roomId);
    if (!room) return null;
    return { room, runtime: this.getRuntime(room) };
  }

  private snapshot(room: StoredRoom, playerId: string): ServerMessage {
    const runtime = this.getRuntime(room);
    const placed = this.store.getPlacements(room.id, room.version);
    const placedSet = new Set(placed.map((entry) => entry.pieceId));
    const locks: Record<string, string> = {};
    for (const [pieceId, lock] of runtime.locks) {
      if (!placedSet.has(pieceId)) locks[pieceId] = lock.playerId;
    }
    const drags: Record<string, DragState> = {};
    for (const [pieceId, drag] of runtime.drags) {
      if (!placedSet.has(pieceId)) drags[pieceId] = drag;
    }

    return {
      type: "snapshot",
      room: roomDto(room, placed.length),
      you: playerId,
      players: this.playersFor(room),
      placedPieces: [...placedSet],
      locks,
      drags,
    };
  }

  private playersFor(room: StoredRoom) {
    const online = new Set<string>();
    const runtime = this.rooms.get(room.id);
    if (runtime) {
      for (const ws of runtime.sockets) {
        const connection = this.connections.get(ws);
        if (connection?.playerId) online.add(connection.playerId);
      }
    }
    return this.store.getPlayers(room.id).map((player) => playerDto(player, online.has(player.id)));
  }

  private announcePlayers(roomId: string): void {
    const room = this.store.getRoomById(roomId);
    if (!room) return;
    this.broadcast(roomId, { type: "players", players: this.playersFor(room) });
  }

  private send(connection: Connection, message: ServerMessage): void {
    if (connection.ws.readyState !== WebSocket.OPEN) return;
    connection.ws.send(JSON.stringify(message));
  }

  private sendError(connection: Connection, code: string, message: string, pieceId?: string): void {
    this.send(connection, { type: "error", code, message, ...(pieceId ? { pieceId } : {}) });
  }

  private broadcast(roomId: string, message: ServerMessage, except?: WebSocket): void {
    const runtime = this.rooms.get(roomId);
    if (!runtime) return;
    const payload = JSON.stringify(message);
    for (const ws of runtime.sockets) {
      if (ws === except) continue;
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private heartbeatTick(): void {
    for (const connection of this.connections.values()) {
      if (!connection.isAlive) {
        connection.ws.terminate();
        continue;
      }
      connection.isAlive = false;
      try {
        connection.ws.ping();
      } catch {
        connection.ws.terminate();
      }
    }
  }
}
