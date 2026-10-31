import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { restoreBackup } from "./backup.mjs";

if (existsSync(".env")) process.loadEnvFile(".env");

const backupDir = process.argv[2];
if (!backupDir) {
  console.error("Usage: npm run restore -- <backup-directory>");
  process.exit(1);
}

console.warn("Stop the Puzzle Together server before restoring. Replacing an open database is unsafe.");
restoreBackup({ backupDir, dataDir: resolve(process.env.DATA_DIR?.trim() || "data") })
  .then((result) => console.log(`Restored into ${result.dataDir}`))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
