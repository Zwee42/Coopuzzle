import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { removeUpload } from "./images";
import { normalizeRoomCode } from "./session";
import { directorySize, pruneOrphanUploads, storageLimitsFromEnv } from "./storage";
import { RoomStore } from "./store";

const day = 24 * 60 * 60 * 1000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function usage(): void {
  console.log(`Puzzle Together maintenance CLI

Usage:
  npm run admin -- list
  npm run admin -- delete <room-code>
  npm run admin -- prune
  npm run admin -- stats

Run this with the server stopped. Connected clients cannot be notified by an
offline CLI process, so stop the server before deleting or pruning rooms.

Environment:
  DATA_DIR                     data directory (default: ./data)
  ROOM_TTL_DAYS                retention for inactive rooms (default: 30; 0 disables)
  ORPHAN_UPLOAD_GRACE_HOURS    age before unreferenced files are removed (default: 24; 0 disables)
  MAX_TOTAL_UPLOAD_MB          global upload budget shown by stats (default: 2048)
  MAX_ROOM_UPLOAD_MB           per-room upload budget shown by stats (default: 24)
`);
}

async function main(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [command, argument] = process.argv.slice(2);
  const dataDir = resolve(process.env.DATA_DIR?.trim() || "data");
  const uploadsDir = join(dataDir, "uploads");
  const store = new RoomStore(dataDir);

  try {
    switch (command) {
      case "list": {
        const rooms = store.listRooms();
        if (rooms.length === 0) {
          console.log("No rooms.");
          return;
        }
        for (const room of rooms) {
          const host = store.getPlayerById(room.hostPlayerId);
          console.log(
            [
              room.code,
              room.name,
              `players=${store.countPlayers(room.id)}`,
              `placed=${store.countPlacements(room.id, room.version)}/${room.rows * room.cols}`,
              `host=${host?.name ?? "unknown"}`,
              `updated=${new Date(room.updatedAt).toISOString()}`,
            ].join("  "),
          );
        }
        return;
      }

      case "delete": {
        if (!argument) {
          usage();
          process.exitCode = 1;
          return;
        }
        const code = normalizeRoomCode(argument);
        const room = store.getRoomByCode(code);
        if (!room) {
          console.error(`No room with code ${code}.`);
          process.exitCode = 1;
          return;
        }
        store.deleteRoom(room.id);
        if (room.imagePath) await removeUpload(room.imagePath, uploadsDir);
        console.log(`Deleted ${room.code} (${room.name}).`);
        return;
      }

      case "prune": {
        const now = Date.now();
        const ttlDays = envNumber("ROOM_TTL_DAYS", 30);
        const graceHours = envNumber("ORPHAN_UPLOAD_GRACE_HOURS", 24);
        const expired = ttlDays > 0 ? store.deleteExpiredRooms(now - ttlDays * day) : [];
        for (const room of expired) {
          if (room.imagePath) await removeUpload(room.imagePath, uploadsDir);
        }
        const pruned =
          graceHours > 0
            ? await pruneOrphanUploads({
                uploadsDir,
                referencedFiles: store.listImagePaths(),
                olderThanMs: graceHours * 60 * 60 * 1000,
                now,
              })
            : { deleted: 0, bytes: 0 };
        console.log(
          `Pruned ${expired.length} expired room(s) and ${pruned.deleted} orphaned upload(s) (${pruned.bytes} bytes).`,
        );
        return;
      }

      case "stats": {
        const limits = storageLimitsFromEnv();
        console.log(
          JSON.stringify(
            {
              dataDir,
              rooms: store.stats(),
              storage: {
                uploadsBytes: await directorySize(uploadsDir),
                maxTotalBytes: limits.maxTotalBytes,
                maxRoomBytes: limits.maxRoomBytes,
              },
            },
            null,
            2,
          ),
        );
        return;
      }

      default:
        usage();
        if (command) process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
