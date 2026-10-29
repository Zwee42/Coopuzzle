import type { DragState, PlayerDto, RoomDto } from "../../shared/protocol";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface GameNotice {
  seq: number;
  message: string;
  tone: "info" | "success" | "error";
  pieceId?: string;
}

export interface GameState {
  room: RoomDto | null;
  you: string | null;
  players: PlayerDto[];
  placed: Record<string, true>;
  locks: Record<string, string>;
  drags: Record<string, DragState>;
  cursors: Record<string, { x: number; y: number; seenAt: number }>;
  connection: ConnectionState;
  deleted: boolean;
  notice: GameNotice | null;
  noticeSeq: number;
}

export type GameAction =
  | {
      type: "snapshot";
      room: RoomDto;
      you: string;
      players: PlayerDto[];
      placedPieces: string[];
      locks: Record<string, string>;
      drags: Record<string, DragState>;
    }
  | { type: "players"; players: PlayerDto[] }
  | { type: "cursor"; playerId: string; x: number; y: number; now: number }
  | { type: "grab"; pieceId: string; playerId: string }
  | { type: "release"; pieceId: string; playerId: string; reason: string }
  | { type: "drag"; pieceId: string; playerId: string; x: number; y: number }
  | { type: "drag_off"; pieceId: string }
  | {
      type: "placed";
      pieceId: string;
      placedCount: number;
      version: number;
      complete: boolean;
    }
  | { type: "puzzle_started"; room: RoomDto; players: PlayerDto[] }
  | { type: "deleted" }
  | { type: "connection"; connection: ConnectionState }
  | { type: "error"; message: string; pieceId?: string }
  | { type: "dismiss_notice"; seq: number }
  | { type: "prune_cursors"; now: number };

export const initialGameState: GameState = {
  room: null,
  you: null,
  players: [],
  placed: {},
  locks: {},
  drags: {},
  cursors: {},
  connection: "connecting",
  deleted: false,
  notice: null,
  noticeSeq: 0,
};

function withNotice(
  state: GameState,
  message: string,
  tone: GameNotice["tone"] = "info",
  pieceId?: string,
): GameState {
  const seq = state.noticeSeq + 1;
  return { ...state, noticeSeq: seq, notice: { seq, message, tone, pieceId } };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "snapshot": {
      const placed = Object.fromEntries(action.placedPieces.map((id) => [id, true])) as Record<
        string,
        true
      >;
      return {
        ...state,
        room: action.room,
        you: action.you,
        players: action.players,
        placed,
        locks: action.locks,
        drags: action.drags,
        connection: "open",
        deleted: false,
      };
    }

    case "players":
      return { ...state, players: action.players };

    case "cursor": {
      if (action.playerId === state.you) return state;
      return {
        ...state,
        cursors: {
          ...state.cursors,
          [action.playerId]: { x: action.x, y: action.y, seenAt: action.now },
        },
      };
    }

    case "grab":
      return {
        ...state,
        locks: { ...state.locks, [action.pieceId]: action.playerId },
      };

    case "release": {
      const locks = { ...state.locks };
      const drags = { ...state.drags };
      delete locks[action.pieceId];
      delete drags[action.pieceId];
      const next = { ...state, locks, drags };
      if (action.reason === "missed" && state.you === action.playerId) {
        return withNotice(next, "Not quite — that piece belongs somewhere else.");
      }
      return next;
    }

    case "drag":
      return {
        ...state,
        drags: {
          ...state.drags,
          [action.pieceId]: {
            playerId: action.playerId,
            x: action.x,
            y: action.y,
          },
        },
      };

    case "drag_off": {
      const drags = { ...state.drags };
      delete drags[action.pieceId];
      return { ...state, drags };
    }

    case "placed": {
      if (!state.room || state.room.version !== action.version) return state;
      const locks = { ...state.locks };
      const drags = { ...state.drags };
      delete locks[action.pieceId];
      delete drags[action.pieceId];
      return {
        ...state,
        placed: { ...state.placed, [action.pieceId]: true },
        locks,
        drags,
        room: {
          ...state.room,
          placedCount: action.placedCount,
          version: action.version,
        },
      };
    }

    case "puzzle_started":
      return withNotice(
        {
          ...state,
          room: action.room,
          players: action.players,
          placed: {},
          locks: {},
          drags: {},
          cursors: {},
          deleted: false,
        },
        "A fresh puzzle is ready.",
        "success",
      );

    case "deleted":
      return { ...state, deleted: true, connection: "closed" };

    case "connection":
      return { ...state, connection: action.connection };

    case "error":
      return withNotice(state, action.message, "error", action.pieceId);

    case "dismiss_notice":
      return state.notice?.seq === action.seq ? { ...state, notice: null } : state;

    case "prune_cursors": {
      const cursors: GameState["cursors"] = {};
      for (const [playerId, cursor] of Object.entries(state.cursors)) {
        if (action.now - cursor.seenAt < 4500) cursors[playerId] = cursor;
      }
      return { ...state, cursors };
    }

    default:
      return state;
  }
}
