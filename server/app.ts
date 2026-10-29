import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { ROOM_CAPACITY, PLAYER_COLORS, isPieceTarget } from "../shared/difficulty";
import { DEFAULT_IMAGES, defaultImageById } from "../shared/defaults";
import type { ApiErrorBody, ImageKind, RoomImage, RoomPreview } from "../shared/protocol";
import { selectGrid } from "../shared/puzzle";
import { InvalidImageError, removeUpload, storeImageUpload } from "./images";
import { RealtimeHub } from "./realtime";
import {
  bearerToken,
  cleanDisplayName,
  hashToken,
  isValidRoomCode,
  newId,
  newPuzzleSeed,
  newRoomCode,
  newToken,
  normalizeRoomCode,
  playerSession,
  roomDto,
} from "./session";
import { RoomFullError, RoomStore, type StoredPlayer, type StoredRoom } from "./store";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface AppDependencies {
  store: RoomStore;
  hub: RealtimeHub;
  uploadsDir: string;
  defaultsDir?: string;
  staticDir?: string;
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiError(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function field(body: unknown, name: string): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePieceCount(raw: string | undefined) {
  const value = Number(raw);
  if (!isPieceTarget(value)) apiError(400, "bad_piece_count", "Choose one of the available piece counts.");
  return value;
}

function parseImageKind(raw: string | undefined): ImageKind {
  if (raw === "upload" || raw === "default") return raw;
  apiError(400, "bad_image", "Choose a bundled image or upload one.");
}

async function resolveImage(
  body: unknown,
  file: Express.Multer.File | undefined,
  uploadsDir: string,
  currentRoom?: StoredRoom,
): Promise<{ image: RoomImage; filename: string | null; newUpload: boolean }> {
  const kind = field(body, "imageKind");
  if (kind === "keep") {
    if (!currentRoom) apiError(400, "bad_image", "There is no picture to keep.");
    return { image: currentRoom.image, filename: currentRoom.imagePath, newUpload: false };
  }
  const parsedKind = parseImageKind(kind);
  if (parsedKind === "upload") {
    if (!file) apiError(400, "missing_image", "Choose a photo to upload.");
    const stored = await storeImageUpload(file.buffer, file.mimetype, uploadsDir);
    return { image: stored.image, filename: stored.filename, newUpload: true };
  }

  const id = field(body, "defaultImageId");
  const image = id ? defaultImageById(id) : undefined;
  if (!image) apiError(400, "bad_image", "Choose one of the bundled images.");
  return {
    image: {
      kind: "default",
      url: image.url,
      width: image.width,
      height: image.height,
      title: image.title,
    },
    filename: null,
    newUpload: false,
  };
}

function getBearerPlayer(store: RoomStore, request: Request, room: StoredRoom): StoredPlayer {
  const token = bearerToken(request.headers.authorization);
  if (!token) apiError(401, "not_authorized", "Your room session is missing.");
  const player = store.getPlayerByToken(room.id, hashToken(token));
  if (!player) apiError(401, "not_authorized", "Your room session has expired.");
  return player;
}

function getRoomOr404(store: RoomStore, rawCode: string): StoredRoom {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) apiError(404, "room_not_found", "That room code does not look right.");
  const room = store.getRoomByCode(code);
  if (!room) apiError(404, "room_not_found", "We could not find a room with that code.");
  return room;
}

function rateLimit(max: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip ?? "local";
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      response.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      next(new ApiError(429, "rate_limited", "That was a lot at once. Give it a moment, then try again."));
      return;
    }
    if (buckets.size > 5000) {
      for (const [storedKey, stored] of buckets) {
        if (stored.resetAt <= now) buckets.delete(storedKey);
      }
    }
    next();
  };
}

function sendError(response: Response, status: number, code: string, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  response.status(status).json(body);
}

export function createApp(deps: AppDependencies) {
  const { store, hub, uploadsDir, defaultsDir, staticDir } = deps;
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 12 },
    fileFilter: (_request, file, callback) => {
      callback(null, UPLOAD_MIME_TYPES.has(file.mimetype));
    },
  });

  const createLimiter = rateLimit(12, 60_000);
  const joinLimiter = rateLimit(40, 60_000);
  const uploadLimiter = rateLimit(30, 60_000);

  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  app.use(
    "/uploads",
    express.static(uploadsDir, {
      index: false,
      dotfiles: "deny",
      maxAge: "1y",
      immutable: true,
      fallthrough: true,
    }),
  );
  if (defaultsDir && existsSync(defaultsDir)) {
    app.use(
      "/defaults",
      express.static(defaultsDir, {
        index: false,
        maxAge: "30d",
        fallthrough: true,
      }),
    );
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/default-images", (_request, response) => {
    response.json({ images: DEFAULT_IMAGES });
  });

  app.post(
    "/api/rooms",
    createLimiter,
    upload.single("image"),
    asyncRoute(async (request, response) => {
      const hostName = cleanDisplayName(field(request.body, "hostName"));
      const roomName = cleanDisplayName(field(request.body, "roomName"), 40) ?? "Our little puzzle";
      if (!hostName) {
        apiError(400, "bad_name", "Choose a name between 1 and 24 characters.");
      }
      const pieceCount = parsePieceCount(field(request.body, "pieceCount"));
      const { image, filename } = await resolveImage(request.body, request.file, uploadsDir);
      const grid = selectGrid(pieceCount, image.width / image.height);

      let code = newRoomCode();
      for (let attempt = 0; attempt < 20 && store.codeExists(code); attempt++) {
        code = newRoomCode();
      }
      if (store.codeExists(code)) {
        if (filename) await removeUpload(filename, uploadsDir);
        apiError(503, "code_unavailable", "Could not make a room code. Please try again.");
      }

      const token = newToken();
      const now = Date.now();
      try {
        const { room, player } = store.createRoom({
          id: newId(),
          code,
          name: roomName,
          host: {
            id: newId(),
            name: hostName,
            color: PLAYER_COLORS[0].value,
            tokenHash: hashToken(token),
          },
          capacity: ROOM_CAPACITY,
          image,
          imagePath: filename,
          pieceTarget: pieceCount,
          rows: grid.rows,
          cols: grid.cols,
          seed: newPuzzleSeed(),
          now,
        });
        response.status(201).json({ room: roomDto(room, 0), player: playerSession(player, token) });
      } catch (error) {
        if (filename) await removeUpload(filename, uploadsDir);
        throw error;
      }
    }),
  );

  app.get(
    "/api/rooms/:code/preview",
    asyncRoute(async (request, response) => {
      const room = getRoomOr404(store, routeParam(request.params.code));
      const host = store.getPlayerById(room.hostPlayerId);
      const playerCount = store.countPlayers(room.id);
      const preview: RoomPreview = {
        code: room.code,
        name: room.name,
        hostName: host?.name ?? "Someone",
        capacity: room.capacity,
        playerCount,
        createdAt: room.createdAt,
        image: room.image,
        totalPieces: room.rows * room.cols,
      };
      response.json({ room: preview });
    }),
  );

  app.post(
    "/api/rooms/:code/join",
    joinLimiter,
    asyncRoute(async (request, response) => {
      const room = getRoomOr404(store, routeParam(request.params.code));
      const token = field(request.body, "token");

      if (token) {
        const existing = store.getPlayerByToken(room.id, hashToken(token));
        if (existing) {
          const placedCount = store.countPlacements(room.id, room.version);
          response.json({ room: roomDto(room, placedCount), player: playerSession(existing, token) });
          return;
        }
      }

      const name = cleanDisplayName(field(request.body, "name"));
      if (!name) {
        if (token) apiError(401, "session_expired", "Your saved session is no longer valid.");
        apiError(400, "bad_name", "Choose a name between 1 and 24 characters.");
      }

      const count = store.countPlayers(room.id);
      if (count >= room.capacity) apiError(409, "room_full", "This room already has its full group.");

      const newTokenValue = newToken();
      try {
        const player = store.addPlayer({
          id: newId(),
          roomId: room.id,
          name,
          color: PLAYER_COLORS[count % PLAYER_COLORS.length].value,
          tokenHash: hashToken(newTokenValue),
          now: Date.now(),
        });
        hub.roomMembershipChanged(room.id);
        const placedCount = store.countPlacements(room.id, room.version);
        response.status(200).json({
          room: roomDto(room, placedCount),
          player: playerSession(player, newTokenValue),
        });
      } catch (error) {
        if (error instanceof RoomFullError) apiError(409, "room_full", error.message);
        throw error;
      }
    }),
  );

  app.post(
    "/api/rooms/:code/puzzle",
    uploadLimiter,
    upload.single("image"),
    asyncRoute(async (request, response) => {
      const room = getRoomOr404(store, routeParam(request.params.code));
      const player = getBearerPlayer(store, request, room);
      const pieceCount = parsePieceCount(field(request.body, "pieceCount"));
      const { image, filename, newUpload } = await resolveImage(
        request.body,
        request.file,
        uploadsDir,
        room,
      );
      const grid = selectGrid(pieceCount, image.width / image.height);

      try {
        const updated = store.updatePuzzle(room.id, {
          image,
          imagePath: filename,
          pieceTarget: pieceCount,
          rows: grid.rows,
          cols: grid.cols,
          seed: newPuzzleSeed(),
          now: Date.now(),
        });
        if (room.imagePath && room.imagePath !== filename) {
          await removeUpload(room.imagePath, uploadsDir);
        }
        hub.puzzleChanged(room.id);
        response.json({ room: roomDto(updated, 0), playerId: player.id });
      } catch (error) {
        if (newUpload && filename) await removeUpload(filename, uploadsDir);
        throw error;
      }
    }),
  );

  app.delete(
    "/api/rooms/:code",
    asyncRoute(async (request, response) => {
      const room = getRoomOr404(store, routeParam(request.params.code));
      const player = getBearerPlayer(store, request, room);
      if (!player.isHost) apiError(403, "host_only", "Only the person who created the room can delete it.");

      store.deleteRoom(room.id);
      hub.roomDeleted(room.id);
      if (room.imagePath) await removeUpload(room.imagePath, uploadsDir);
      response.status(204).end();
    }),
  );

  app.use("/api", (_request, response) => {
    sendError(response, 404, "not_found", "That API route does not exist.");
  });

  if (staticDir && existsSync(join(staticDir, "index.html"))) {
    app.use(
      express.static(staticDir, {
        index: false,
        maxAge: "1h",
        setHeaders: (response, filePath) => {
          if (filePath.includes(`${join(staticDir, "assets")}`)) {
            response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    app.use((request, response, next) => {
      if (request.method !== "GET" || !request.accepts("html")) {
        next();
        return;
      }
      readFile(join(staticDir, "index.html"))
        .then((html) => {
          response.setHeader("Cache-Control", "no-cache");
          response.type("html").send(html);
        })
        .catch(next);
    });
  }

  app.use((_request, response) => {
    response.status(404).type("text").send("Not found");
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    if (error instanceof InvalidImageError) {
      sendError(response, 400, error.code, error.message);
      return;
    }
    if (error instanceof RoomFullError) {
      sendError(response, 409, error.code, error.message);
      return;
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "That photo is too large. Please choose one under 12 MB."
          : "That upload could not be accepted.";
      sendError(response, 400, "upload_error", message);
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      sendError(response, 400, "bad_json", "That request body was not valid JSON.");
      return;
    }
    console.error("Unhandled request error:", error);
    sendError(response, 500, "internal_error", "Something went wrong on our side.");
  });

  return app;
}
