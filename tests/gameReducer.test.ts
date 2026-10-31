import { describe, expect, it } from "vitest";
import type { RoomDto } from "../shared/protocol";
import {
  gameReducer,
  initialGameState,
  type GameState,
} from "../src/state/gameReducer";

const room: RoomDto = {
  code: "ABCDE23",
  name: "Reducer room",
  hostPlayerId: "host",
  capacity: 4,
  createdAt: 1,
  image: {
    kind: "default",
    url: "/defaults/golden-hour.svg",
    width: 1600,
    height: 1000,
    title: "Golden Hour",
  },
  rows: 4,
  cols: 6,
  seed: 99,
  pieceTarget: 24,
  version: 1,
  placedCount: 0,
  totalPieces: 24,
};

const players = [
  { id: "host", name: "Maya", color: "#b95f54", isHost: true, online: true },
  { id: "guest", name: "Theo", color: "#63816d", isHost: false, online: true },
];

function connected(): GameState {
  return gameReducer(initialGameState, {
    type: "snapshot",
    room,
    you: "host",
    players,
    placedPieces: [],
    locks: {},
    drags: {},
  });
}

describe("snapshot", () => {
  it("turns placed piece ids into a set and opens the connection", () => {
    const state = gameReducer(initialGameState, {
      type: "snapshot",
      room,
      you: "host",
      players,
      placedPieces: ["r0c0", "r1c2"],
      locks: { r2c3: "guest" },
      drags: { r2c3: { playerId: "guest", x: 0.4, y: 0.5 } },
    });
    expect(state.room).toEqual(room);
    expect(state.you).toBe("host");
    expect(state.placed).toEqual({ r0c0: true, r1c2: true });
    expect(state.locks).toEqual({ r2c3: "guest" });
    expect(state.drags).toEqual({ r2c3: { playerId: "guest", x: 0.4, y: 0.5 } });
    expect(state.connection).toBe("open");
    expect(state.deleted).toBe(false);
  });
});

describe("piece lifecycle", () => {
  it("adds and removes locks and drags", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "guest" });
    expect(state.locks).toEqual({ r0c0: "guest" });

    state = gameReducer(state, {
      type: "drag",
      pieceId: "r0c0",
      playerId: "guest",
      x: 0.25,
      y: 0.5,
    });
    expect(state.drags.r0c0).toEqual({ playerId: "guest", x: 0.25, y: 0.5 });

    state = gameReducer(state, { type: "drag_off", pieceId: "r0c0" });
    expect(state.drags).toEqual({});

    state = gameReducer(state, {
      type: "release",
      pieceId: "r0c0",
      playerId: "guest",
      reason: "cancelled",
    });
    expect(state.locks).toEqual({});
    expect(state.notice).toBeNull();
  });

  it("shows a gentle notice when your own drop misses", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "host" });
    state = gameReducer(state, {
      type: "release",
      pieceId: "r0c0",
      playerId: "host",
      reason: "missed",
    });
    expect(state.locks).toEqual({});
    expect(state.notice).toMatchObject({
      tone: "info",
      pieceId: undefined,
      message: expect.stringMatching(/belongs somewhere else/),
    });
  });

  it("does not notify you when another player misses", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "guest" });
    state = gameReducer(state, {
      type: "release",
      pieceId: "r0c0",
      playerId: "guest",
      reason: "missed",
    });
    expect(state.notice).toBeNull();
  });

  it("applies a placement, clears the lock and updates progress", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "host" });
    state = gameReducer(state, {
      type: "drag",
      pieceId: "r0c0",
      playerId: "host",
      x: 0.1,
      y: 0.1,
    });
    state = gameReducer(state, {
      type: "placed",
      pieceId: "r0c0",
      placedCount: 1,
      version: 1,
      complete: false,
    });
    expect(state.placed).toEqual({ r0c0: true });
    expect(state.locks).toEqual({});
    expect(state.drags).toEqual({});
    expect(state.room?.placedCount).toBe(1);
    expect(state.room?.version).toBe(1);
  });

  it("ignores a late placement from an old puzzle version", () => {
    const state = connected();
    const next = gameReducer(state, {
      type: "placed",
      pieceId: "r0c0",
      placedCount: 5,
      version: 99,
      complete: false,
    });
    expect(next).toBe(state);
  });
});

describe("puzzle and room lifecycle", () => {
  it("resets all board state on a new puzzle", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "host" });
    state = gameReducer(state, {
      type: "drag",
      pieceId: "r0c0",
      playerId: "host",
      x: 0.5,
      y: 0.5,
    });
    state = gameReducer(state, {
      type: "placed",
      pieceId: "r1c1",
      placedCount: 1,
      version: 1,
      complete: false,
    });

    const nextRoom = { ...room, version: 2, pieceTarget: 12 as const, rows: 3, cols: 4, seed: 2, placedCount: 0 };
    state = gameReducer(state, { type: "puzzle_started", room: nextRoom, players });
    expect(state.room).toEqual(nextRoom);
    expect(state.placed).toEqual({});
    expect(state.locks).toEqual({});
    expect(state.drags).toEqual({});
    expect(state.cursors).toEqual({});
    expect(state.notice).toMatchObject({ tone: "success", message: "A fresh puzzle is ready." });
  });

  it("updates room metadata without clearing the board or locks", () => {
    let state = connected();
    state = gameReducer(state, { type: "grab", pieceId: "r0c0", playerId: "guest" });
    const promoted = { ...room, hostPlayerId: "guest" };
    state = gameReducer(state, {
      type: "room_updated",
      room: promoted,
      players: players.map((player) => ({ ...player, isHost: player.id === "guest" })),
    });
    expect(state.room?.hostPlayerId).toBe("guest");
    expect(state.locks).toEqual({ r0c0: "guest" });
    expect(state.players.find((player) => player.id === "guest")?.isHost).toBe(true);
  });

  it("marks the room deleted and closes the connection", () => {
    const state = gameReducer(connected(), { type: "deleted" });
    expect(state.deleted).toBe(true);
    expect(state.connection).toBe("closed");
  });
});

describe("presence and notices", () => {
  it("ignores your own cursor and keeps other cursors", () => {
    let state = connected();
    state = gameReducer(state, { type: "cursor", playerId: "host", x: 0.1, y: 0.1, now: 1 });
    expect(state.cursors).toEqual({});
    state = gameReducer(state, { type: "cursor", playerId: "guest", x: 0.2, y: 0.3, now: 2 });
    expect(state.cursors.guest).toEqual({ x: 0.2, y: 0.3, seenAt: 2 });
  });

  it("prunes stale cursors after 4.5 seconds", () => {
    let state = connected();
    state = gameReducer(state, { type: "cursor", playerId: "guest", x: 0.2, y: 0.3, now: 1_000 });
    state = gameReducer(state, { type: "prune_cursors", now: 5_400 });
    expect(state.cursors.guest).toBeDefined();
    state = gameReducer(state, { type: "prune_cursors", now: 5_600 });
    expect(state.cursors).toEqual({});
  });

  it("shows server errors as notices and dismisses only the matching one", () => {
    let state = connected();
    state = gameReducer(state, {
      type: "error",
      message: "Theo is holding that piece.",
      pieceId: "r0c0",
    });
    expect(state.notice).toMatchObject({
      tone: "error",
      message: "Theo is holding that piece.",
      pieceId: "r0c0",
    });
    const seq = state.notice?.seq ?? 0;
    state = gameReducer(state, { type: "dismiss_notice", seq: seq + 1 });
    expect(state.notice).not.toBeNull();
    state = gameReducer(state, { type: "dismiss_notice", seq });
    expect(state.notice).toBeNull();
  });
});
