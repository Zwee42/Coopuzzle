import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PieceTarget } from "../shared/difficulty";
import type { ImageKind, RoomImage } from "../shared/protocol";

export interface StoredRoom {
  id: string;
  code: string;
  name: string;
  hostPlayerId: string;
  capacity: number;
  image: RoomImage;
  imagePath: string | null;
  pieceTarget: PieceTarget;
  rows: number;
  cols: number;
  seed: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredPlayer {
  id: string;
  roomId: string;
  name: string;
  color: string;
  tokenHash: string;
  isHost: boolean;
  joinedAt: number;
}

export interface StoredPlacement {
  pieceId: string;
  placedBy: string;
  placedAt: number;
}

export class RoomFullError extends Error {
  readonly code = "room_full";
  constructor() {
    super("This room already has all of its players.");
  }
}

interface RoomRow {
  id: string;
  code: string;
  name: string;
  host_player_id: string;
  capacity: number;
  image_kind: ImageKind;
  image_url: string;
  image_title: string | null;
  image_width: number;
  image_height: number;
  image_path: string | null;
  piece_target: number;
  rows: number;
  cols: number;
  seed: number;
  version: number;
  created_at: number;
  updated_at: number;
}

interface PlayerRow {
  id: string;
  room_id: string;
  name: string;
  color: string;
  token_hash: string;
  is_host: number;
  joined_at: number;
}

interface PlacementRow {
  piece_id: string;
  placed_by: string;
  placed_at: number;
}

function mapRoom(row: RoomRow): StoredRoom {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostPlayerId: row.host_player_id,
    capacity: row.capacity,
    image: {
      kind: row.image_kind,
      url: row.image_url,
      width: row.image_width,
      height: row.image_height,
      title: row.image_title ?? undefined,
    },
    imagePath: row.image_path,
    pieceTarget: row.piece_target as PieceTarget,
    rows: row.rows,
    cols: row.cols,
    seed: row.seed,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlayer(row: PlayerRow): StoredPlayer {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    color: row.color,
    tokenHash: row.token_hash,
    isHost: Boolean(row.is_host),
    joinedAt: row.joined_at,
  };
}

function mapPlacement(row: PlacementRow): StoredPlacement {
  return {
    pieceId: row.piece_id,
    placedBy: row.placed_by,
    placedAt: row.placed_at,
  };
}

export interface CreateRoomInput {
  id: string;
  code: string;
  name: string;
  host: {
    id: string;
    name: string;
    color: string;
    tokenHash: string;
  };
  capacity: number;
  image: RoomImage;
  imagePath: string | null;
  pieceTarget: PieceTarget;
  rows: number;
  cols: number;
  seed: number;
  now: number;
}

export interface AddPlayerInput {
  id: string;
  roomId: string;
  name: string;
  color: string;
  tokenHash: string;
  now: number;
}

export interface UpdatePuzzleInput {
  image: RoomImage;
  imagePath: string | null;
  pieceTarget: PieceTarget;
  rows: number;
  cols: number;
  seed: number;
  now: number;
}

export class RoomStore {
  private readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(join(dataDir, "puzzle-together.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        host_player_id TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 4,
        image_kind TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_title TEXT,
        image_width INTEGER NOT NULL,
        image_height INTEGER NOT NULL,
        image_path TEXT,
        piece_target INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        cols INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        is_host INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS players_token ON players(room_id, token_hash);
      CREATE INDEX IF NOT EXISTS players_room ON players(room_id);

      CREATE TABLE IF NOT EXISTS placed_pieces (
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        piece_id TEXT NOT NULL,
        placed_by TEXT NOT NULL,
        placed_at INTEGER NOT NULL,
        PRIMARY KEY(room_id, version, piece_id)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  createRoom(input: CreateRoomInput): { room: StoredRoom; player: StoredPlayer } {
    const timestamp = input.now;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO rooms (
            id, code, name, host_player_id, capacity,
            image_kind, image_url, image_title, image_width, image_height, image_path,
            piece_target, rows, cols, seed, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          input.id,
          input.code,
          input.name,
          input.host.id,
          input.capacity,
          input.image.kind,
          input.image.url,
          input.image.title ?? null,
          input.image.width,
          input.image.height,
          input.imagePath,
          input.pieceTarget,
          input.rows,
          input.cols,
          input.seed,
          timestamp,
          timestamp,
        );

      this.db
        .prepare(
          `INSERT INTO players (id, room_id, name, color, token_hash, is_host, joined_at)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          input.host.id,
          input.id,
          input.host.name,
          input.host.color,
          input.host.tokenHash,
          timestamp,
        );

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const room = this.getRoomById(input.id);
    const player = this.getPlayerById(input.host.id);
    if (!room || !player) throw new Error("Room creation failed");
    return { room, player };
  }

  getRoomByCode(code: string): StoredRoom | null {
    const row = this.db.prepare("SELECT * FROM rooms WHERE code = ?").get(code) as RoomRow | undefined;
    return row ? mapRoom(row) : null;
  }

  getRoomById(id: string): StoredRoom | null {
    const row = this.db.prepare("SELECT * FROM rooms WHERE id = ?").get(id) as RoomRow | undefined;
    return row ? mapRoom(row) : null;
  }

  codeExists(code: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM rooms WHERE code = ?").get(code));
  }

  getPlayerById(id: string): StoredPlayer | null {
    const row = this.db.prepare("SELECT * FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
    return row ? mapPlayer(row) : null;
  }

  getPlayerByToken(roomId: string, tokenHash: string): StoredPlayer | null {
    const row = this.db
      .prepare("SELECT * FROM players WHERE room_id = ? AND token_hash = ?")
      .get(roomId, tokenHash) as PlayerRow | undefined;
    return row ? mapPlayer(row) : null;
  }

  getPlayers(roomId: string): StoredPlayer[] {
    const rows = this.db
      .prepare("SELECT * FROM players WHERE room_id = ? ORDER BY joined_at ASC, id ASC")
      .all(roomId) as unknown as PlayerRow[];
    return rows.map(mapPlayer);
  }

  countPlayers(roomId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM players WHERE room_id = ?")
      .get(roomId) as { count: number };
    return Number(row.count);
  }

  addPlayer(input: AddPlayerInput): StoredPlayer {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const room = this.db
        .prepare("SELECT capacity FROM rooms WHERE id = ?")
        .get(input.roomId) as { capacity: number } | undefined;
      if (!room) throw new Error("Room not found");
      const countRow = this.db
        .prepare("SELECT COUNT(*) AS count FROM players WHERE room_id = ?")
        .get(input.roomId) as { count: number };
      if (Number(countRow.count) >= Number(room.capacity)) throw new RoomFullError();

      this.db
        .prepare(
          `INSERT INTO players (id, room_id, name, color, token_hash, is_host, joined_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(input.id, input.roomId, input.name, input.color, input.tokenHash, input.now);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const player = this.getPlayerById(input.id);
    if (!player) throw new Error("Player creation failed");
    return player;
  }

  getPlacements(roomId: string, version: number): StoredPlacement[] {
    const rows = this.db
      .prepare(
        "SELECT piece_id, placed_by, placed_at FROM placed_pieces WHERE room_id = ? AND version = ? ORDER BY placed_at ASC",
      )
      .all(roomId, version) as unknown as PlacementRow[];
    return rows.map(mapPlacement);
  }

  countPlacements(roomId: string, version: number): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM placed_pieces WHERE room_id = ? AND version = ?")
      .get(roomId, version) as { count: number };
    return Number(row.count);
  }

  placePiece(roomId: string, version: number, pieceId: string, playerId: string, now: number): number {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO placed_pieces (room_id, version, piece_id, placed_by, placed_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(roomId, version, pieceId, playerId, now);
    return this.countPlacements(roomId, version);
  }

  updatePuzzle(roomId: string, input: UpdatePuzzleInput): StoredRoom {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.db.prepare("SELECT version FROM rooms WHERE id = ?").get(roomId) as
        | { version: number }
        | undefined;
      if (!current) throw new Error("Room not found");
      const nextVersion = Number(current.version) + 1;

      this.db
        .prepare(
          `UPDATE rooms SET
            image_kind = ?, image_url = ?, image_title = ?, image_width = ?, image_height = ?,
            image_path = ?, piece_target = ?, rows = ?, cols = ?, seed = ?, version = ?, updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.image.kind,
          input.image.url,
          input.image.title ?? null,
          input.image.width,
          input.image.height,
          input.imagePath,
          input.pieceTarget,
          input.rows,
          input.cols,
          input.seed,
          nextVersion,
          input.now,
          roomId,
        );

      this.db.prepare("DELETE FROM placed_pieces WHERE room_id = ?").run(roomId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const room = this.getRoomById(roomId);
    if (!room) throw new Error("Room update failed");
    return room;
  }

  deleteRoom(roomId: string): void {
    this.db.prepare("DELETE FROM rooms WHERE id = ?").run(roomId);
  }
}
