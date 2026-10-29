import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { PlayerDto, PlayerSession, RoomDto } from "../shared/protocol";
import type { StoredPlayer, StoredRoom } from "./store";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 7;

export function newId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((character) => CODE_ALPHABET.includes(character));
}

export function newPuzzleSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}

export function cleanDisplayName(raw: unknown, maxLength = 24): string | null {
  if (typeof raw !== "string") return null;
  const name = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length === 0 || name.length > maxLength) return null;
  return name;
}

export function roomDto(room: StoredRoom, placedCount: number): RoomDto {
  return {
    code: room.code,
    name: room.name,
    hostPlayerId: room.hostPlayerId,
    capacity: room.capacity,
    createdAt: room.createdAt,
    image: room.image,
    rows: room.rows,
    cols: room.cols,
    seed: room.seed,
    pieceTarget: room.pieceTarget,
    version: room.version,
    placedCount,
    totalPieces: room.rows * room.cols,
  };
}

export function playerDto(player: StoredPlayer, online: boolean): PlayerDto {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    isHost: player.isHost,
    online,
  };
}

export function playerSession(player: StoredPlayer, token: string): PlayerSession {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    isHost: player.isHost,
    token,
  };
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export function asUploadFilename(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const name = url.slice("/uploads/".length);
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name)) return null;
  return name;
}
