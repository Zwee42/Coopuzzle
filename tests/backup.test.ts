import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "../scripts/backup.mjs";
import { RoomStore } from "../server/store";
import { hashToken, newId, newPuzzleSeed, newToken } from "../server/session";

let root: string;
let dataDir: string;
let backupDir: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "puzzle-together-backup-"));
  dataDir = join(root, "data");
  backupDir = join(root, "backup");
  await mkdir(join(dataDir, "uploads"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const run = promisify(execFile);

describe("backup and restore", () => {
  it("accepts an output directory argument from the CLI", async () => {
    const store = new RoomStore(dataDir);
    store.close();
    const cliBackupDir = join(root, "cli-backup");
    await run(process.execPath, [join(process.cwd(), "scripts", "backup.mjs"), cliBackupDir], {
      env: { ...process.env, DATA_DIR: dataDir },
    });
    expect(existsSync(join(cliBackupDir, "puzzle-together.db"))).toBe(true);
    expect(existsSync(join(cliBackupDir, "manifest.json"))).toBe(true);
  });

  it("snapshots the database and uploads, then restores them", async () => {
    const store = new RoomStore(dataDir);
    const token = newToken();
    const hostId = newId();
    const uploadName = `${randomUUID()}.png`;
    await writeFile(join(dataDir, "uploads", uploadName), Buffer.from("photo bytes"));
    const now = Date.now();
    const { room } = store.createRoom({
      id: newId(),
      code: "ABCDE23",
      name: "Backup room",
      host: {
        id: hostId,
        name: "Maya",
        color: "#b95f54",
        tokenHash: hashToken(token),
      },
      capacity: 4,
      image: {
        kind: "upload",
        url: `/uploads/${uploadName}`,
        width: 320,
        height: 200,
      },
      imagePath: uploadName,
      pieceTarget: 12,
      rows: 3,
      cols: 4,
      seed: newPuzzleSeed(),
      now,
    });

    // Back up while the store is still open, as the real server does.
    const result = await createBackup({ dataDir, outDir: backupDir });
    expect(result.databaseBytes).toBeGreaterThan(0);
    expect(existsSync(join(backupDir, "puzzle-together.db"))).toBe(true);
    expect(existsSync(join(backupDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(backupDir, "uploads", uploadName))).toBe(true);
    store.close();

    const destructive = new RoomStore(dataDir);
    destructive.deleteRoom(room.id);
    destructive.close();
    const staleName = `${randomUUID()}.png`;
    await writeFile(join(dataDir, "uploads", staleName), Buffer.from("stale photo"));
    await writeFile(join(dataDir, "puzzle-together.db-wal"), Buffer.from("stale wal"));
    expect(existsSync(join(dataDir, "uploads", uploadName))).toBe(true);

    await restoreBackup({ backupDir, dataDir });

    expect(existsSync(join(dataDir, "uploads", staleName))).toBe(false);
    expect(existsSync(join(dataDir, "puzzle-together.db-wal"))).toBe(false);
    const restored = new RoomStore(dataDir);
    const restoredRoom = restored.getRoomByCode("ABCDE23");
    expect(restoredRoom).toMatchObject({ name: "Backup room", imagePath: uploadName });
    expect(restored.getPlayerById(hostId)?.name).toBe("Maya");
    restored.close();
    expect(existsSync(join(dataDir, "uploads", uploadName))).toBe(true);
  });
});
