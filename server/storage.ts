import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

export const UPLOAD_FILENAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

export interface StorageLimits {
  /** Total bytes allowed across all uploaded room images. */
  maxTotalBytes: number;
  /** Bytes allowed for one room's current image. */
  maxRoomBytes: number;
}

export class StorageLimitError extends Error {
  readonly code = "storage_limit";
  readonly status = 507;
}

let uploadLock: Promise<void> = Promise.resolve();

/**
 * Serialize budget checks and upload writes so two concurrent requests cannot
 * both pass the same free-space check.
 */
export function withStorageLock<T>(task: () => Promise<T>): Promise<T> {
  const run = uploadLock.then(task, task);
  uploadLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function envMegabytes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function storageLimitsFromEnv(): StorageLimits {
  return {
    maxTotalBytes: envMegabytes("MAX_TOTAL_UPLOAD_MB", 2048) * 1024 * 1024,
    maxRoomBytes: envMegabytes("MAX_ROOM_UPLOAD_MB", 24) * 1024 * 1024,
  };
}

export async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    total += await fileSize(join(dir, entry.name));
  }
  return total;
}

export async function assertUploadFits(options: {
  uploadsDir: string;
  incomingBytes: number;
  replaceFile: string | null;
  limits: StorageLimits;
}): Promise<void> {
  const { uploadsDir, incomingBytes, replaceFile, limits } = options;
  if (incomingBytes > limits.maxRoomBytes) {
    throw new StorageLimitError(
      `That image is larger than this room's ${Math.round(limits.maxRoomBytes / 1024 / 1024)} MB budget.`,
    );
  }
  const replacedBytes = replaceFile ? await fileSize(join(uploadsDir, replaceFile)) : 0;
  const total = await directorySize(uploadsDir);
  if (total - replacedBytes + incomingBytes > limits.maxTotalBytes) {
    throw new StorageLimitError(
      "The photo store is full. Delete an old room or ask the host to free some space.",
    );
  }
}

export interface OrphanPruneResult {
  deleted: number;
  bytes: number;
}

/**
 * Delete upload files that no room references. The age grace period protects a
 * file that was written just before its room row was committed.
 */
export async function pruneOrphanUploads(options: {
  uploadsDir: string;
  referencedFiles: Iterable<string>;
  olderThanMs: number;
  now?: number;
}): Promise<OrphanPruneResult> {
  const { uploadsDir, referencedFiles, olderThanMs, now = Date.now() } = options;
  const referenced = new Set(referencedFiles);
  let entries;
  try {
    entries = await readdir(uploadsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { deleted: 0, bytes: 0 };
    throw error;
  }

  let deleted = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !UPLOAD_FILENAME.test(entry.name) || referenced.has(entry.name)) {
      continue;
    }
    const path = join(uploadsDir, entry.name);
    try {
      const info = await stat(path);
      if (now - info.mtimeMs < olderThanMs) continue;
      await unlink(path);
      deleted++;
      bytes += info.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return { deleted, bytes };
}
