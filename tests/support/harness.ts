import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type {
  ClientMessage,
  CreatedRoomResponse,
  JoinRoomResponse,
  ServerMessage,
} from "../../shared/protocol";
import { createApp } from "../../server/app";
import { RealtimeHub } from "../../server/realtime";
import { RoomStore } from "../../server/store";

type MessageOf<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

export interface TestServer {
  baseUrl: string;
  dataDir: string;
  uploadsDir: string;
  store: RoomStore;
  hub: RealtimeHub;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const dataDir = mkdtempSync(join(tmpdir(), "puzzle-together-test-"));
  const uploadsDir = join(dataDir, "uploads");
  const store = new RoomStore(dataDir);
  const hub = new RealtimeHub(store);
  const app = createApp({
    store,
    hub,
    uploadsDir,
    defaultsDir: join(process.cwd(), "public", "defaults"),
  });
  const server: Server = createServer(app);
  hub.attach(server);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server has no port");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    dataDir,
    uploadsDir,
    store,
    hub,
    async close() {
      hub.dispose();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          server.closeAllConnections?.();
          resolve();
        }, 2_000);
        server.close(() => {
          clearTimeout(timer);
          resolve();
        });
        server.closeIdleConnections?.();
      });
      store.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export interface JsonResponse<T> {
  status: number;
  body: T;
  headers: Headers;
}

export async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : (undefined as T);
  return { status: response.status, body, headers: response.headers };
}

export interface TestRoom {
  code: string;
  token: string;
  playerId: string;
  room: CreatedRoomResponse["room"];
  raw: CreatedRoomResponse;
}

export async function createTestRoom(
  baseUrl: string,
  options: {
    hostName?: string;
    roomName?: string;
    pieceCount?: number;
    defaultImageId?: string;
  } = {},
): Promise<TestRoom> {
  const form = new FormData();
  form.set("hostName", options.hostName ?? "Maya");
  form.set("roomName", options.roomName ?? "Our little test");
  form.set("pieceCount", String(options.pieceCount ?? 12));
  form.set("imageKind", "default");
  form.set("defaultImageId", options.defaultImageId ?? "golden-hour");

  const response = await requestJson<CreatedRoomResponse>(baseUrl, "/api/rooms", {
    method: "POST",
    body: form,
  });
  if (response.status !== 201) {
    throw new Error(`Room creation failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return {
    code: response.body.room.code,
    token: response.body.player.token,
    playerId: response.body.player.id,
    room: response.body.room,
    raw: response.body,
  };
}

export async function joinTestRoom(
  baseUrl: string,
  code: string,
  name: string,
): Promise<JoinRoomResponse> {
  const response = await requestJson<JoinRoomResponse>(baseUrl, `/api/rooms/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (response.status !== 200) {
    throw new Error(`Join failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

interface Waiter {
  matches: (message: ServerMessage) => boolean;
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class TestSocket {
  private readonly inbox: ServerMessage[] = [];
  private readonly waiters: Waiter[] = [];
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => this.receive(data.toString()));
    ws.on("close", () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("Socket closed before the expected message arrived"));
      }
    });
    ws.on("error", () => {
      // The close event settles pending waiters.
    });
  }

  static async open(baseUrl: string): Promise<TestSocket> {
    const url = `${baseUrl.replace(/^http/, "ws")}/ws`;
    const ws = new WebSocket(url);
    const socket = new TestSocket(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return socket;
  }

  async hello(code: string, token: string): Promise<MessageOf<"snapshot">> {
    this.send({ type: "hello", code, token });
    return this.next("snapshot");
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  next<T extends ServerMessage["type"]>(
    type: T,
    predicate?: (message: MessageOf<T>) => boolean,
    timeout = 4_000,
  ): Promise<MessageOf<T>> {
    const matches = (message: ServerMessage): message is MessageOf<T> =>
      message.type === type && (!predicate || predicate(message as MessageOf<T>));

    const index = this.inbox.findIndex(matches);
    if (index >= 0) {
      const [message] = this.inbox.splice(index, 1);
      return Promise.resolve(message as MessageOf<T>);
    }
    if (this.closed) return Promise.reject(new Error("Socket is closed"));

    return new Promise<MessageOf<T>>((resolve, reject) => {
      const waiter: Waiter = {
        matches,
        resolve: (message) => resolve(message as MessageOf<T>),
        reject,
        timer: setTimeout(() => {
          const position = this.waiters.indexOf(waiter);
          if (position >= 0) this.waiters.splice(position, 1);
          reject(
            new Error(
              `Timed out waiting for ${type}. Inbox: ${JSON.stringify(
                this.inbox.map((message) => message.type),
              )}`,
            ),
          );
        }, timeout),
      };
      this.waiters.push(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      this.ws.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.close();
    });
  }

  private receive(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    const waiterIndex = this.waiters.findIndex((waiter) => waiter.matches(message));
    if (waiterIndex >= 0) {
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    this.inbox.push(message);
    if (this.inbox.length > 500) this.inbox.shift();
  }
}
