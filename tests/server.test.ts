import { existsSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ApiErrorBody,
  CreatedRoomResponse,
  JoinRoomResponse,
  RoomDto,
  RoomPreview,
  ServerMessage,
} from "../shared/protocol";
import {
  TestSocket,
  createTestRoom,
  joinTestRoom,
  requestJson,
  startTestServer,
  type TestServer,
} from "./support/harness";

let server: TestServer;
let sockets: TestSocket[];

beforeEach(async () => {
  server = await startTestServer();
  sockets = [];
});

afterEach(async () => {
  for (const socket of sockets) await socket.close();
  await server.close();
});

async function openSocket(): Promise<TestSocket> {
  const socket = await TestSocket.open(server.baseUrl);
  sockets.push(socket);
  return socket;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, "ascii");
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

/** A tiny, valid, dependency-free PNG encoder for upload tests. */
function makePng(width: number, height: number, rgb: [number, number, number] = [185, 95, 84]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function uploadForm(
  png: Buffer,
  options: { hostName?: string; pieceCount?: number; mime?: string; name?: string } = {},
): FormData {
  const form = new FormData();
  form.set("hostName", options.hostName ?? "Maya");
  form.set("roomName", "A photo room");
  form.set("pieceCount", String(options.pieceCount ?? 12));
  form.set("imageKind", "upload");
  form.append(
    "image",
    new Blob([new Uint8Array(png)], { type: options.mime ?? "image/png" }),
    options.name ?? "photo.png",
  );
  return form;
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe("REST rooms", () => {
  it("serves health and bundled images", async () => {
    const health = await requestJson<{ ok: boolean }>(server.baseUrl, "/api/health");
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);

    const defaults = await requestJson<{ images: Array<{ id: string; url: string }> }>(
      server.baseUrl,
      "/api/default-images",
    );
    expect(defaults.status).toBe(200);
    expect(defaults.body.images.map((image) => image.id)).toEqual([
      "golden-hour",
      "moonlit-garden",
      "the-long-road",
      "sunday-morning",
    ]);
    const image = await fetch(`${server.baseUrl}${defaults.body.images[0].url}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("creates a room, previews it and restores a saved seat", async () => {
    const room = await createTestRoom(server.baseUrl, {
      hostName: "Maya",
      roomName: "Sunday together",
      pieceCount: 24,
    });
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{7}$/);
    expect(room.room).toMatchObject({
      name: "Sunday together",
      capacity: 4,
      totalPieces: 24,
      placedCount: 0,
      version: 1,
      image: { kind: "default", title: "Golden Hour" },
    });
    expect(room.room.rows * room.room.cols).toBe(24);

    const preview = await requestJson<{ room: RoomPreview }>(
      server.baseUrl,
      `/api/rooms/${room.code}/preview`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.room).toMatchObject({
      code: room.code,
      hostName: "Maya",
      playerCount: 1,
      capacity: 4,
      totalPieces: 24,
    });

    const rejoin = await requestJson<JoinRoomResponse>(
      server.baseUrl,
      `/api/rooms/${room.code}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: room.token }),
      },
    );
    expect(rejoin.status).toBe(200);
    expect(rejoin.body.player.id).toBe(room.playerId);
    expect(rejoin.body.player.token).toBe(room.token);
    expect(rejoin.body.room.placedCount).toBe(0);
  });

  it("rejects bad names, piece counts and images with useful errors", async () => {
    const badCount = new FormData();
    badCount.set("hostName", "Maya");
    badCount.set("pieceCount", "13");
    badCount.set("imageKind", "default");
    badCount.set("defaultImageId", "golden-hour");
    const countResponse = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: badCount,
    });
    expect(countResponse.status).toBe(400);
    expect(countResponse.body.error.code).toBe("bad_piece_count");

    const badName = new FormData();
    badName.set("hostName", "   ");
    badName.set("pieceCount", "12");
    badName.set("imageKind", "default");
    badName.set("defaultImageId", "golden-hour");
    const nameResponse = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: badName,
    });
    expect(nameResponse.status).toBe(400);
    expect(nameResponse.body.error.code).toBe("bad_name");

    const badImage = new FormData();
    badImage.set("hostName", "Maya");
    badImage.set("pieceCount", "12");
    badImage.set("imageKind", "default");
    badImage.set("defaultImageId", "not-a-real-image");
    const imageResponse = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: badImage,
    });
    expect(imageResponse.status).toBe(400);
    expect(imageResponse.body.error.code).toBe("bad_image");

    const missing = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms/NOPE/preview");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("room_not_found");
  });

  it("seats four people and refuses a fifth new member", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 12 });
    const guest = await joinTestRoom(server.baseUrl, room.code, "Theo");
    expect(guest.player.isHost).toBe(false);
    expect(guest.player.color).not.toBe(room.raw.player.color);
    await joinTestRoom(server.baseUrl, room.code, "June");
    await joinTestRoom(server.baseUrl, room.code, "Kai");

    const fifth = await requestJson<ApiErrorBody>(
      server.baseUrl,
      `/api/rooms/${room.code}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      },
    );
    expect(fifth.status).toBe(409);
    expect(fifth.body.error.code).toBe("room_full");

    const preview = await requestJson<{ room: RoomPreview }>(
      server.baseUrl,
      `/api/rooms/${room.code}/preview`,
    );
    expect(preview.body.room.playerCount).toBe(4);
  });
});

describe("REST uploads and puzzle changes", () => {
  it("serves an uploaded image immediately, keeps it on restart and deletes it when replaced or closed", async () => {
    const createResponse = await requestJson<CreatedRoomResponse>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: uploadForm(makePng(320, 200)),
    });
    expect(createResponse.status).toBe(201);
    const room = createResponse.body.room;
    const token = createResponse.body.player.token;
    expect(room.image.kind).toBe("upload");
    expect(room.image.url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.png$/);
    const firstFile = room.image.url.split("/").pop()!;
    expect(existsSync(join(server.uploadsDir, firstFile))).toBe(true);

    const served = await fetch(`${server.baseUrl}${room.image.url}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toContain("image/png");
    expect(served.headers.get("cache-control")).toContain("immutable");

    const keep = new FormData();
    keep.set("pieceCount", "24");
    keep.set("imageKind", "keep");
    const kept = await requestJson<{ room: RoomDto }>(
      server.baseUrl,
      `/api/rooms/${room.code}/puzzle`,
      { method: "POST", headers: auth(token), body: keep },
    );
    expect(kept.status).toBe(200);
    expect(kept.body.room.version).toBe(2);
    expect(kept.body.room.image.url).toBe(room.image.url);
    expect(kept.body.room.totalPieces).toBe(24);
    expect((await fetch(`${server.baseUrl}${room.image.url}`)).status).toBe(200);

    const replace = new FormData();
    replace.set("pieceCount", "12");
    replace.set("imageKind", "default");
    replace.set("defaultImageId", "moonlit-garden");
    const replaced = await requestJson<{ room: RoomDto }>(
      server.baseUrl,
      `/api/rooms/${room.code}/puzzle`,
      { method: "POST", headers: auth(token), body: replace },
    );
    expect(replaced.status).toBe(200);
    expect(replaced.body.room.version).toBe(3);
    expect(replaced.body.room.image.kind).toBe("default");
    expect(existsSync(join(server.uploadsDir, firstFile))).toBe(false);
    expect((await fetch(`${server.baseUrl}${room.image.url}`)).status).toBe(404);

    const secondUpload = new FormData();
    secondUpload.set("pieceCount", "12");
    secondUpload.set("imageKind", "upload");
    secondUpload.append(
      "image",
      new Blob([new Uint8Array(makePng(200, 320))], { type: "image/png" }),
      "second.png",
    );
    const uploaded = await requestJson<{ room: RoomDto }>(
      server.baseUrl,
      `/api/rooms/${room.code}/puzzle`,
      { method: "POST", headers: auth(token), body: secondUpload },
    );
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.room.version).toBe(4);
    const secondFile = uploaded.body.room.image.url.split("/").pop()!;
    expect(existsSync(join(server.uploadsDir, secondFile))).toBe(true);

    const removed = await fetch(`${server.baseUrl}/api/rooms/${room.code}`, {
      method: "DELETE",
      headers: auth(token),
    });
    expect(removed.status).toBe(204);
    expect(existsSync(join(server.uploadsDir, secondFile))).toBe(false);
  });

  it("rejects tiny images, mismatched contents and missing authentication", async () => {
    const tiny = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: uploadForm(makePng(1, 1)),
    });
    expect(tiny.status).toBe(400);
    expect(tiny.body.error.code).toBe("invalid_image");

    const mismatched = await requestJson<ApiErrorBody>(server.baseUrl, "/api/rooms", {
      method: "POST",
      body: uploadForm(makePng(120, 80), { mime: "image/jpeg", name: "photo.jpg" }),
    });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.error.code).toBe("invalid_image");

    const room = await createTestRoom(server.baseUrl, { pieceCount: 12 });
    const noAuth = new FormData();
    noAuth.set("pieceCount", "24");
    noAuth.set("imageKind", "keep");
    const unauthorized = await requestJson<ApiErrorBody>(
      server.baseUrl,
      `/api/rooms/${room.code}/puzzle`,
      { method: "POST", body: noAuth },
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error.code).toBe("not_authorized");
  });

  it("lets a non-host member start a new puzzle, but not delete the room", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 24 });
    const guest = await joinTestRoom(server.baseUrl, room.code, "Theo");

    const restart = new FormData();
    restart.set("pieceCount", "12");
    restart.set("imageKind", "keep");
    const restarted = await requestJson<{ room: RoomDto }>(
      server.baseUrl,
      `/api/rooms/${room.code}/puzzle`,
      { method: "POST", headers: auth(guest.player.token), body: restart },
    );
    expect(restarted.status).toBe(200);
    expect(restarted.body.room.version).toBe(2);
    expect(restarted.body.room.totalPieces).toBe(12);

    const forbidden = await requestJson<ApiErrorBody>(
      server.baseUrl,
      `/api/rooms/${room.code}`,
      { method: "DELETE", headers: auth(guest.player.token) },
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("host_only");
  });
});

describe("WebSocket realtime flow", () => {
  it("authenticates, locks, broadcasts drags, rejects misses and persists placements", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 12 });
    const guest = await joinTestRoom(server.baseUrl, room.code, "Theo");
    const rows = room.room.rows;
    const cols = room.room.cols;

    const hostSocket = await openSocket();
    const guestSocket = await openSocket();
    const hostSnapshot = await hostSocket.hello(room.code, room.token);
    const guestSnapshot = await guestSocket.hello(room.code, guest.player.token);
    expect(hostSnapshot.you).toBe(room.playerId);
    expect(guestSnapshot.you).toBe(guest.player.id);
    expect(hostSnapshot.placedPieces).toEqual([]);
    expect(hostSnapshot.players.filter((player) => player.online)).toHaveLength(1);
    expect(guestSnapshot.players.filter((player) => player.online)).toHaveLength(2);

    hostSocket.send({ type: "grab_piece", pieceId: "r0c0", version: 1 });
    expect(await hostSocket.next("piece_grabbed")).toMatchObject({
      pieceId: "r0c0",
      playerId: room.playerId,
    });
    expect(await guestSocket.next("piece_grabbed")).toMatchObject({
      pieceId: "r0c0",
      playerId: room.playerId,
    });

    guestSocket.send({ type: "grab_piece", pieceId: "r0c0", version: 1 });
    const busy = await guestSocket.next("error");
    expect(busy).toMatchObject({ code: "piece_busy", pieceId: "r0c0" });

    hostSocket.send({ type: "drag_piece", pieceId: "r0c0", version: 1, x: 0.4, y: 0.3 });
    expect(await guestSocket.next("piece_drag")).toMatchObject({
      pieceId: "r0c0",
      playerId: room.playerId,
      x: 0.4,
      y: 0.3,
    });

    hostSocket.send({ type: "place_piece", pieceId: "r0c0", version: 1, x: 0.95, y: 0.95 });
    expect(await guestSocket.next("piece_released")).toMatchObject({
      pieceId: "r0c0",
      reason: "missed",
    });
    expect(await hostSocket.next("piece_released")).toMatchObject({ reason: "missed" });
    const storedBefore = server.store.getRoomByCode(room.code)!;
    expect(server.store.countPlacements(storedBefore.id, storedBefore.version)).toBe(0);

    hostSocket.send({ type: "grab_piece", pieceId: "r0c0", version: 1 });
    await hostSocket.next("piece_grabbed", (message) => message.pieceId === "r0c0");
    await guestSocket.next("piece_grabbed", (message) => message.pieceId === "r0c0");

    const firstCenter = { x: 0.5 / cols, y: 0.5 / rows };
    hostSocket.send({
      type: "place_piece",
      pieceId: "r0c0",
      version: 1,
      ...firstCenter,
    });
    expect(await hostSocket.next("piece_placed")).toMatchObject({
      pieceId: "r0c0",
      placedCount: 1,
      complete: false,
    });
    expect(await guestSocket.next("piece_placed")).toMatchObject({
      pieceId: "r0c0",
      placedCount: 1,
      complete: false,
    });

    guestSocket.send({ type: "place_piece", pieceId: "r1c1", version: 1, x: 0.4, y: 0.4 });
    expect(await guestSocket.next("error")).toMatchObject({ code: "not_holding" });

    const remaining: Array<{ id: string; x: number; y: number }> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const id = `r${row}c${col}`;
        if (id !== "r0c0") {
          remaining.push({ id, x: (col + 0.5) / cols, y: (row + 0.5) / rows });
        }
      }
    }

    let lastPlacement: Extract<ServerMessage, { type: "piece_placed" }> | null = null;
    for (const piece of remaining) {
      hostSocket.send({ type: "grab_piece", pieceId: piece.id, version: 1 });
      await hostSocket.next("piece_grabbed", (message) => message.pieceId === piece.id);
      hostSocket.send({
        type: "place_piece",
        pieceId: piece.id,
        version: 1,
        x: piece.x,
        y: piece.y,
      });
      lastPlacement = await hostSocket.next(
        "piece_placed",
        (message) => message.pieceId === piece.id,
      );
    }
    expect(lastPlacement).toMatchObject({ placedCount: 12, complete: true });
    expect(
      await guestSocket.next("piece_placed", (message) => message.complete),
    ).toMatchObject({ placedCount: 12, complete: true });

    const storedRoom = server.store.getRoomByCode(room.code)!;
    expect(server.store.countPlacements(storedRoom.id, storedRoom.version)).toBe(12);

    await hostSocket.close();
    await guestSocket.close();
    sockets = sockets.filter((socket) => socket !== hostSocket && socket !== guestSocket);

    const refreshed = await openSocket();
    const refreshedSnapshot = await refreshed.hello(room.code, room.token);
    expect(refreshedSnapshot.placedPieces).toHaveLength(12);
    expect(refreshedSnapshot.room.placedCount).toBe(12);
    expect(refreshedSnapshot.room.version).toBe(1);
  });

  it("broadcasts presence, restarts for everyone and rejects stale versions", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 24 });
    const guest = await joinTestRoom(server.baseUrl, room.code, "Theo");

    const hostSocket = await openSocket();
    const guestSocket = await openSocket();
    await hostSocket.hello(room.code, room.token);
    await guestSocket.hello(room.code, guest.player.token);

    const restart = new FormData();
    restart.set("pieceCount", "12");
    restart.set("imageKind", "keep");
    const response = await fetch(`${server.baseUrl}/api/rooms/${room.code}/puzzle`, {
      method: "POST",
      headers: auth(guest.player.token),
      body: restart,
    });
    expect(response.status).toBe(200);

    expect(await hostSocket.next("puzzle_started")).toMatchObject({
      room: { version: 2, totalPieces: 12, placedCount: 0 },
    });
    expect(await guestSocket.next("puzzle_started")).toMatchObject({
      room: { version: 2, totalPieces: 12, placedCount: 0 },
    });

    hostSocket.send({ type: "grab_piece", pieceId: "r0c0", version: 1 });
    expect(await hostSocket.next("error")).toMatchObject({ code: "stale" });

    hostSocket.send({ type: "grab_piece", pieceId: "r0c0", version: 2 });
    expect(await hostSocket.next("piece_grabbed")).toMatchObject({ pieceId: "r0c0" });

    await guestSocket.close();
    sockets = sockets.filter((socket) => socket !== guestSocket);
    const presence = await hostSocket.next(
      "players",
      (message) => message.players.find((player) => player.id === guest.player.id)?.online === false,
    );
    expect(presence.players.find((player) => player.id === guest.player.id)?.online).toBe(false);
  });

  it("rejects an invalid token and malformed piece mutations", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 12 });
    const bad = await openSocket();
    bad.send({ type: "hello", code: room.code, token: "not-a-real-token" });
    expect(await bad.next("error")).toMatchObject({ code: "not_authorized" });

    const socket = await openSocket();
    await socket.hello(room.code, room.token);
    socket.send({ type: "grab_piece", pieceId: "r99c99", version: 1 });
    expect(await socket.next("error")).toMatchObject({ code: "bad_piece" });
    socket.send({ type: "place_piece", pieceId: "r0c0", version: 1, x: 2, y: -1 });
    expect(await socket.next("error")).toMatchObject({ code: "bad_piece" });
    socket.send({ type: "release_piece", pieceId: "r0c0", version: 1 });
    expect(server.store.countPlacements(server.store.getRoomByCode(room.code)!.id, 1)).toBe(0);
  });

  it("closes the room for everyone when the host deletes it", async () => {
    const room = await createTestRoom(server.baseUrl, { pieceCount: 12 });
    const guest = await joinTestRoom(server.baseUrl, room.code, "Theo");
    const hostSocket = await openSocket();
    const guestSocket = await openSocket();
    await hostSocket.hello(room.code, room.token);
    await guestSocket.hello(room.code, guest.player.token);

    const deleted = await fetch(`${server.baseUrl}/api/rooms/${room.code}`, {
      method: "DELETE",
      headers: auth(room.token),
    });
    expect(deleted.status).toBe(204);
    await hostSocket.next("room_deleted");
    await guestSocket.next("room_deleted");
    expect(await requestJson(server.baseUrl, `/api/rooms/${room.code}/preview`)).toMatchObject({
      status: 404,
    });
  });
});
