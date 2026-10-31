import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, stat, utimes, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  StorageLimitError,
  assertUploadFits,
  directorySize,
  pruneOrphanUploads,
} from "../server/storage";

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "puzzle-together-storage-"));
  await mkdir(dir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function makeFile(bytes: number): Promise<string> {
  const name = `${randomUUID()}.png`;
  await writeFile(join(dir, name), Buffer.alloc(bytes, 1));
  return name;
}

describe("upload storage budgets", () => {
  it("sums file sizes and allows a replacement within the same budget", async () => {
    const first = await makeFile(10);
    await makeFile(20);
    expect(await directorySize(dir)).toBe(30);

    await expect(
      assertUploadFits({
        uploadsDir: dir,
        incomingBytes: 20,
        replaceFile: null,
        limits: { maxTotalBytes: 25, maxRoomBytes: 20 },
      }),
    ).rejects.toBeInstanceOf(StorageLimitError);

    await expect(
      assertUploadFits({
        uploadsDir: dir,
        incomingBytes: 20,
        replaceFile: first,
        limits: { maxTotalBytes: 40, maxRoomBytes: 20 },
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a file over the per-room budget before writing it", async () => {
    await expect(
      assertUploadFits({
        uploadsDir: dir,
        incomingBytes: 30,
        replaceFile: null,
        limits: { maxTotalBytes: 1_000, maxRoomBytes: 20 },
      }),
    ).rejects.toMatchObject({ status: 507, code: "storage_limit" });
  });
});

describe("orphan upload cleanup", () => {
  it("deletes only old, unreferenced upload files", async () => {
    const referenced = await makeFile(5);
    const oldOrphan = await makeFile(7);
    const freshOrphan = await makeFile(9);
    const now = Date.now();
    await utimes(join(dir, referenced), new Date(now - 60_000), new Date(now - 60_000));
    await utimes(join(dir, oldOrphan), new Date(now - 60_000), new Date(now - 60_000));

    const result = await pruneOrphanUploads({
      uploadsDir: dir,
      referencedFiles: [referenced],
      olderThanMs: 30_000,
      now,
    });
    expect(result).toEqual({ deleted: 1, bytes: 7 });
    await expect(stat(join(dir, referenced))).resolves.toBeDefined();
    await expect(stat(join(dir, freshOrphan))).resolves.toBeDefined();
    await expect(stat(join(dir, oldOrphan))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
