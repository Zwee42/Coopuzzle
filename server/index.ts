import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createApp } from "./app";
import { logger } from "./log";
import { startMaintenance } from "./maintenance";
import { RealtimeHub } from "./realtime";
import { RoomStore } from "./store";

if (existsSync(".env")) process.loadEnvFile(".env");

function positiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const rawPort = process.env.PORT;
const port = rawPort === undefined || rawPort.trim() === "" ? 8787 : Number(rawPort);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  logger.error("invalid_port", { port: process.env.PORT });
  process.exit(1);
}
const host = process.env.HOST?.trim() || "0.0.0.0";
const dataDir = resolve(process.env.DATA_DIR?.trim() || "data");
const uploadsDir = join(dataDir, "uploads");
const distDir = resolve("dist");
const defaultsDir = existsSync(join(distDir, "defaults"))
  ? join(distDir, "defaults")
  : resolve("public/defaults");

const day = 24 * 60 * 60 * 1000;
const roomTtlMs = positiveNumber("ROOM_TTL_DAYS", 30) * day;
const hostTransferMs = positiveNumber("HOST_TRANSFER_DAYS", 14) * day;
const orphanGraceMs = positiveNumber("ORPHAN_UPLOAD_GRACE_HOURS", 24) * 60 * 60 * 1000;
const maintenanceIntervalMs = Math.max(
  positiveNumber("MAINTENANCE_INTERVAL_MINUTES", 60) * 60 * 1000,
  60_000,
);

const store = new RoomStore(dataDir);
const hub = new RealtimeHub(store);
const app = createApp({
  store,
  hub,
  uploadsDir,
  defaultsDir,
  staticDir: distDir,
});
const server = createServer(app);
hub.attach(server);

const stopMaintenance = startMaintenance({
  store,
  hub,
  uploadsDir,
  intervalMs: maintenanceIntervalMs,
  roomTtlMs,
  hostTransferMs,
  orphanGraceMs,
});

server.on("error", (error) => {
  logger.error("server_error", { message: (error as Error).message });
  stopMaintenance();
  hub.dispose();
  store.close();
  process.exit(1);
});

server.listen(port, host, () => {
  logger.info("server_started", {
    host,
    port,
    dataDir,
    roomTtlDays: roomTtlMs / day,
    hostTransferDays: hostTransferMs / day,
    maintenanceIntervalMinutes: maintenanceIntervalMs / 60_000,
  });
});

let stopping = false;
let finished = false;
function finishShutdown(): void {
  if (finished) return;
  finished = true;
  store.close();
  process.exit(0);
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("server_stopping", { signal });
  stopMaintenance();
  hub.dispose();
  server.close(finishShutdown);
  setTimeout(finishShutdown, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
