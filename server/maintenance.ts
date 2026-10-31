import { removeUpload } from "./images";
import { logger } from "./log";
import type { RealtimeHub } from "./realtime";
import { pruneOrphanUploads } from "./storage";
import type { RoomStore } from "./store";

export interface MaintenanceOptions {
  store: RoomStore;
  hub: RealtimeHub;
  uploadsDir: string;
  intervalMs: number;
  roomTtlMs: number;
  hostTransferMs: number;
  orphanGraceMs: number;
}

/**
 * Runs retention, host recovery and orphan-file cleanup in the background.
 * A value of 0 disables that individual policy.
 */
export function startMaintenance(options: MaintenanceOptions): () => void {
  const { store, hub, uploadsDir, intervalMs, roomTtlMs, hostTransferMs, orphanGraceMs } = options;
  let running = false;
  let stopped = false;

  async function run(): Promise<void> {
    if (running || stopped) return;
    running = true;
    const now = Date.now();
    try {
      if (hostTransferMs > 0) {
        const changed = store.reassignInactiveHosts(now - hostTransferMs, now);
        for (const room of changed) {
          hub.roomUpdated(room.id);
          logger.info("host_transferred", { roomId: room.id, code: room.code });
        }
      }

      if (roomTtlMs > 0) {
        const expired = store.deleteExpiredRooms(now - roomTtlMs);
        for (const room of expired) {
          hub.roomDeleted(room.id);
          if (room.imagePath) await removeUpload(room.imagePath, uploadsDir);
          logger.info("room_expired", {
            roomId: room.id,
            code: room.code,
            updatedAt: room.updatedAt,
          });
        }
      }

      if (orphanGraceMs > 0) {
        const pruned = await pruneOrphanUploads({
          uploadsDir,
          referencedFiles: store.listImagePaths(),
          olderThanMs: orphanGraceMs,
          now,
        });
        if (pruned.deleted > 0) {
          logger.info("orphan_uploads_pruned", {
            deleted: pruned.deleted,
            bytes: pruned.bytes,
          });
        }
      }
    } catch (error) {
      logger.error("maintenance_failed", { message: (error as Error).message });
    } finally {
      running = false;
    }
  }

  const initial = setTimeout(run, 5_000);
  initial.unref?.();
  const interval = setInterval(run, intervalMs);
  interval.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(interval);
  };
}
