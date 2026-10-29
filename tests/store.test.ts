import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PieceTarget } from "../shared/difficulty";
import { RoomFullError, RoomStore, type StoredRoom } from "../server/store";
import { hashToken, newId, newPuzzleSeed, newToken } from "../server/session";

let dataDir: string;
let store: RoomStore;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "puzzle-together-store-"));
  store = new RoomStore(dataDir);
});

afterEach(() => {
  try {
    store.close();
  } catch {
    // A test may have closed and reopened the store.
  }
  rmSync(dataDir, { recursive: true, force: true });
});

function createRoom(overrides: { pieceTarget?: PieceTarget; seed?: number } = {}): {
  room: StoredRoom;
  hostId: string;
  token: string;
} {
  const token = newToken();
  const hostId = newId();
  const now = Date.now();
  const { room } = store.createRoom({
    id: newId(),
    code: "ABCDE23",
    name: "Store test room",
    host: {
      id: hostId,
      name: "Maya",
      color: "#b95f54",
      tokenHash: hashToken(token),
    },
    capacity: 4,
    image: {
      kind: "default",
      url: "/defaults/golden-hour.svg",
      width: 1600,
      height: 1000,
      title: "Golden Hour",
    },
    imagePath: null,
    pieceTarget: overrides.pieceTarget ?? 24,
    rows: 4,
    cols: 6,
    seed: overrides.seed ?? newPuzzleSeed(),
    now,
  });
  return { room, hostId, token };
}

describe("RoomStore rooms", () => {
  it("creates a room and its host atomically", () => {
    const { room, hostId } = createRoom();
    expect(store.getRoomByCode(room.code)).toEqual(room);
    expect(store.getRoomById(room.id)).toEqual(room);
    expect(store.codeExists(room.code)).toBe(true);
    expect(store.codeExists("ZZZZZ99")).toBe(false);
    expect(store.countPlayers(room.id)).toBe(1);

    const host = store.getPlayerById(hostId);
    expect(host).toMatchObject({
      id: hostId,
      roomId: room.id,
      name: "Maya",
      color: "#b95f54",
      isHost: true,
    });
  });

  it("stores only the token hash, never the token itself", () => {
    const { room, hostId, token } = createRoom();
    expect(store.getPlayerByToken(room.id, hashToken(token))?.id).toBe(hostId);
    expect(store.getPlayerByToken(room.id, token)).toBeNull();
    expect(store.getPlayerById(hostId)?.tokenHash).toBe(hashToken(token));
    expect(store.getPlayerById(hostId)?.tokenHash).not.toBe(token);
  });

  it("enforces the four-person capacity at the store layer", () => {
    const { room } = createRoom();
    for (const name of ["Theo", "June", "Kai"]) {
      store.addPlayer({
        id: newId(),
        roomId: room.id,
        name,
        color: "#63816d",
        tokenHash: hashToken(newToken()),
        now: Date.now(),
      });
    }
    expect(store.countPlayers(room.id)).toBe(4);
    expect(() =>
      store.addPlayer({
        id: newId(),
        roomId: room.id,
        name: "Fifth",
        color: "#a77b32",
        tokenHash: hashToken(newToken()),
        now: Date.now(),
      }),
    ).toThrow(RoomFullError);
    expect(store.countPlayers(room.id)).toBe(4);
  });

  it("deletes players and placements with the room", () => {
    const { room, hostId } = createRoom();
    store.placePiece(room.id, room.version, "r0c0", hostId, Date.now());
    expect(store.countPlacements(room.id, room.version)).toBe(1);

    store.deleteRoom(room.id);
    expect(store.getRoomById(room.id)).toBeNull();
    expect(store.getPlayerById(hostId)).toBeNull();
    expect(store.countPlacements(room.id, room.version)).toBe(0);
  });
});

describe("RoomStore placements", () => {
  it("records placements once and reports the count", () => {
    const { room, hostId } = createRoom();
    expect(store.countPlacements(room.id, room.version)).toBe(0);
    expect(store.placePiece(room.id, room.version, "r0c0", hostId, 1)).toBe(1);
    expect(store.placePiece(room.id, room.version, "r0c0", hostId, 2)).toBe(1);
    expect(store.placePiece(room.id, room.version, "r1c2", hostId, 3)).toBe(2);

    const placements = store.getPlacements(room.id, room.version);
    expect(placements.map((placement) => placement.pieceId)).toEqual(["r0c0", "r1c2"]);
    expect(placements[1]).toMatchObject({ placedBy: hostId, placedAt: 3 });
  });

  it("keeps placements isolated by puzzle version", () => {
    const { room, hostId } = createRoom();
    store.placePiece(room.id, room.version, "r0c0", hostId, 1);
    expect(store.countPlacements(room.id, room.version + 1)).toBe(0);
  });

  it("increments the version and clears the board when the puzzle changes", () => {
    const { room, hostId } = createRoom();
    store.placePiece(room.id, room.version, "r0c0", hostId, 1);
    store.placePiece(room.id, room.version, "r1c1", hostId, 2);

    const updated = store.updatePuzzle(room.id, {
      image: {
        kind: "default",
        url: "/defaults/moonlit-garden.svg",
        width: 1600,
        height: 1000,
        title: "Moonlit Garden",
      },
      imagePath: null,
      pieceTarget: 12,
      rows: 3,
      cols: 4,
      seed: 9876,
      now: Date.now(),
    });

    expect(updated.version).toBe(room.version + 1);
    expect(updated.pieceTarget).toBe(12);
    expect(updated.rows * updated.cols).toBe(12);
    expect(updated.seed).toBe(9876);
    expect(updated.image.title).toBe("Moonlit Garden");
    expect(store.countPlacements(room.id, room.version)).toBe(0);
    expect(store.countPlacements(room.id, updated.version)).toBe(0);
  });
});

describe("RoomStore persistence", () => {
  it("survives a close and reopen with placements intact", () => {
    const { room, hostId } = createRoom({ seed: 555 });
    store.placePiece(room.id, room.version, "r0c0", hostId, 123);
    store.close();

    store = new RoomStore(dataDir);
    const reopened = store.getRoomByCode(room.code);
    expect(reopened).toEqual(room);
    expect(store.getPlacements(room.id, room.version)).toEqual([
      { pieceId: "r0c0", placedBy: hostId, placedAt: 123 },
    ]);
    expect(store.getPlayerById(hostId)?.name).toBe("Maya");
  });
});
