import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createApp } from "./app";
import { RealtimeHub } from "./realtime";
import { RoomStore } from "./store";

if (existsSync(".env")) process.loadEnvFile(".env");

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const dataDir = resolve(process.env.DATA_DIR ?? "data");
const uploadsDir = join(dataDir, "uploads");
const distDir = resolve("dist");
const defaultsDir = existsSync(join(distDir, "defaults"))
  ? join(distDir, "defaults")
  : resolve("public/defaults");

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

server.listen(port, host, () => {
  console.log(`Puzzle Together listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: closing Puzzle Together.`);
  hub.dispose();
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => {
    store.close();
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
