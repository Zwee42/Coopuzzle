import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function countFiles(dir) {
  let count = 0;
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) count += await countFiles(join(dir, entry.name));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return count;
}

const UPLOAD_FILENAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

function referencedUploads(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db
      .prepare("SELECT image_path FROM rooms WHERE image_path IS NOT NULL")
      .all()
      .map((row) => row.image_path);
  } finally {
    db.close();
  }
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

/**
 * Create a snapshot of the SQLite database and uploads. SQLite's serialize()
 * captures the current WAL state, so this is safe while the server is running
 * as long as no restore is attempted until it stops. Uploads are copied after
 * the database snapshot and verified against it; if a room changed during the
 * copy, the snapshot is retried so the pair stays consistent.
 */
export async function createBackup({ dataDir, outDir }) {
  const source = resolve(dataDir);
  const destination = resolve(outDir);
  if (destination === source || destination.startsWith(source + sep)) {
    throw new Error("Choose a backup directory outside DATA_DIR.");
  }
  const dbPath = join(source, "puzzle-together.db");
  if (!(await exists(dbPath))) throw new Error(`No database found at ${dbPath}`);

  await mkdir(destination, { recursive: true });
  const uploads = join(source, "uploads");
  const destinationUploads = join(destination, "uploads");
  const destinationDb = join(destination, "puzzle-together.db");

  for (let attempt = 1; attempt <= 3; attempt++) {
    // A repeated backup into the same directory must not keep files that the
    // source no longer contains.
    await rm(destinationUploads, { recursive: true, force: true });

    const db = new DatabaseSync(dbPath);
    let bytes;
    try {
      db.exec("PRAGMA busy_timeout = 5000");
      bytes = db.serialize();
    } finally {
      db.close();
    }
    await writeFile(destinationDb, bytes);

    try {
      if (await exists(uploads)) {
        await cp(uploads, destinationUploads, { recursive: true, force: true });
      } else {
        await mkdir(destinationUploads, { recursive: true });
      }
    } catch (error) {
      if (attempt === 3) throw error;
      await wait(100);
      continue;
    }

    const missing = [];
    for (const filename of referencedUploads(destinationDb)) {
      if (
        typeof filename !== "string" ||
        !UPLOAD_FILENAME.test(filename) ||
        !(await exists(join(destinationUploads, filename)))
      ) {
        missing.push(filename);
      }
    }
    if (missing.length > 0) {
      if (attempt === 3) {
        throw new Error(
          `Uploads changed while the backup was running (${missing.length} missing). Stop the server and retry.`,
        );
      }
      await wait(100);
      continue;
    }

    const manifest = {
      createdAt: new Date().toISOString(),
      sourceDataDir: source,
      databaseBytes: bytes.byteLength,
      uploadFiles: await countFiles(destinationUploads),
    };
    await writeFile(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { outDir: destination, ...manifest };
  }

  throw new Error("Could not create a consistent backup. Stop the server and retry.");
}

/**
 * Restore a backup into a data directory. Stop the server first; replacing an
 * open SQLite file underneath a running process is not safe.
 */
export async function restoreBackup({ backupDir, dataDir }) {
  const source = resolve(backupDir);
  const destination = resolve(dataDir);
  if (source === destination || source.startsWith(destination + sep)) {
    throw new Error("Move the backup directory outside DATA_DIR before restoring.");
  }
  const dbPath = join(source, "puzzle-together.db");
  if (!(await exists(dbPath))) throw new Error(`No backup database found at ${dbPath}`);
  if (!(await exists(join(source, "manifest.json")))) {
    throw new Error("That directory does not look like a Puzzle Together backup.");
  }
  const backupUploads = join(source, "uploads");
  for (const filename of referencedUploads(dbPath)) {
    if (
      typeof filename !== "string" ||
      !UPLOAD_FILENAME.test(filename) ||
      !(await exists(join(backupUploads, filename)))
    ) {
      throw new Error(`The backup is missing a referenced upload (${String(filename)}).`);
    }
  }

  await mkdir(destination, { recursive: true });
  // Remove stale WAL/SHM files first: replaying an old WAL against a restored
  // database would corrupt it. Replace uploads rather than merging so photos
  // that were deleted after the backup do not stay publicly addressable.
  await rm(join(destination, "puzzle-together.db-wal"), { force: true });
  await rm(join(destination, "puzzle-together.db-shm"), { force: true });
  await rm(join(destination, "puzzle-together.db-journal"), { force: true });
  await rm(join(destination, "uploads"), { recursive: true, force: true });
  await cp(dbPath, join(destination, "puzzle-together.db"), { force: true });
  const uploads = join(source, "uploads");
  if (await exists(uploads)) {
    await cp(uploads, join(destination, "uploads"), { recursive: true, force: true });
  }
  return { dataDir: destination };
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [first, second] = process.argv.slice(2);
  const dataDir = resolve(process.env.DATA_DIR?.trim() || "data");

  if (first === "restore") {
    if (!second) {
      console.error("Usage: npm run restore -- <backup-directory>");
      process.exitCode = 1;
      return;
    }
    console.warn("Stop the Puzzle Together server before restoring. Replacing an open database is unsafe.");
    const result = await restoreBackup({ backupDir: second, dataDir });
    console.log(`Restored into ${result.dataDir}`);
    return;
  }

  const outDir = resolve(first ?? join("backups", `puzzle-together-${timestamp()}`));
  const result = await createBackup({ dataDir, outDir });
  console.log(`Backup written to ${result.outDir}`);
  console.log(`Database: ${result.databaseBytes} bytes, upload files: ${result.uploadFiles}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
