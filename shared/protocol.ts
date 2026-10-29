import type { PieceTarget } from "./difficulty";

export type ImageKind = "default" | "upload";

export interface RoomImage {
  kind: ImageKind;
  url: string;
  width: number;
  height: number;
  title?: string;
}

export interface RoomDto {
  code: string;
  name: string;
  hostPlayerId: string;
  capacity: number;
  createdAt: number;
  image: RoomImage;
  rows: number;
  cols: number;
  seed: number;
  pieceTarget: PieceTarget;
  version: number;
  placedCount: number;
  totalPieces: number;
}

export interface PlayerDto {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  online: boolean;
}

export interface PlayerSession {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  token: string;
}

export interface CreatedRoomResponse {
  room: RoomDto;
  player: PlayerSession;
}

export type JoinRoomResponse = CreatedRoomResponse;

export interface RoomPreview {
  code: string;
  name: string;
  hostName: string;
  capacity: number;
  playerCount: number;
  createdAt: number;
  image: RoomImage;
  totalPieces: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface DragState {
  playerId: string;
  x: number;
  y: number;
}

export type ClientMessage =
  | { type: "hello"; code: string; token: string }
  | { type: "grab_piece"; pieceId: string; version: number }
  | { type: "release_piece"; pieceId: string; version: number }
  | { type: "drag_piece"; pieceId: string; version: number; x: number; y: number }
  | { type: "drag_off"; pieceId: string; version: number }
  | { type: "place_piece"; pieceId: string; version: number; x: number; y: number }
  | { type: "cursor"; x: number; y: number };

export type ServerMessage =
  | {
      type: "snapshot";
      room: RoomDto;
      you: string;
      players: PlayerDto[];
      placedPieces: string[];
      locks: Record<string, string>;
      drags: Record<string, DragState>;
    }
  | {
      type: "players";
      players: PlayerDto[];
    }
  | {
      type: "cursor";
      playerId: string;
      x: number;
      y: number;
    }
  | {
      type: "piece_grabbed";
      pieceId: string;
      playerId: string;
    }
  | {
      type: "piece_released";
      pieceId: string;
      playerId: string;
      reason: "cancelled" | "missed" | "disconnected" | "stale";
    }
  | {
      type: "piece_drag";
      pieceId: string;
      playerId: string;
      x: number;
      y: number;
    }
  | {
      type: "piece_drag_off";
      pieceId: string;
    }
  | {
      type: "piece_placed";
      pieceId: string;
      playerId: string;
      placedCount: number;
      version: number;
      complete: boolean;
    }
  | {
      type: "puzzle_started";
      room: RoomDto;
      players: PlayerDto[];
    }
  | {
      type: "room_deleted";
    }
  | {
      type: "error";
      code: string;
      message: string;
      pieceId?: string;
    };

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === "hello" ||
    type === "grab_piece" ||
    type === "release_piece" ||
    type === "drag_piece" ||
    type === "drag_off" ||
    type === "place_piece" ||
    type === "cursor"
  );
}
