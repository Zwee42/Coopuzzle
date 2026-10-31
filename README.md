# Puzzle Together

[![Ownit](https://ownit.ownit-worker.workers.dev/badge/Zwee42/Coopuzzle.svg)](https://ownit.ownit-worker.workers.dev/Zwee42/Coopuzzle)

A private, persistent, realtime jigsaw room for two — with room for four. One person creates a
room, picks one of four original illustrations or uploads a photo, and chooses a piece count. The
room lives at an unlisted invite link until its host deletes it or it sits unused for 30 days. No
accounts, no timers, no scores.

Pieces can be dragged or tap-selected into place. Every grab, drag, placement and cursor is shared
over one WebSocket, and the board is saved in SQLite so it is still there after a refresh, a server
restart, or a long pause for tea.

## What is in the box

- Shared realtime board with server-authoritative piece locks, drag ghosts and live cursors.
- Private rooms with 7-character codes and invite links. Rooms are never listed publicly.
- Up to 4 players, each with a display name and colour. The creator is the host.
- Four bundled SVG illustrations or JPEG/PNG/WebP uploads, resized in the browser and re-encoded on
  the server (which strips EXIF/GPS metadata).
- Exact piece counts: **12, 24, 48, 80, 120, 200, 300**.
- Classic interlocking pieces generated deterministically from a room seed. No rotation.
- A tray of loose pieces; a piece dropped within `0.9` of a cell of its home slot snaps and locks.
- Persistent SQLite state, uploaded images on local disk, and automatic rejoin with a saved token.
- Host-only room deletion, any-player restart/change with a confirmation dialog.
- Responsive layout for phones, tablets and desktop, plus reduced-motion support.
- Board zoom/pan, a floating reference picture, and All/Edges/Corners tray filters.
- Scannable QR invite codes and a full reference-picture dialog.
- Retention and host recovery: inactive rooms expire after 30 days, and a quiet host is replaced by
  the most recently active member after 14 days.
- Per-room and global upload budgets, orphan-file cleanup, structured JSON logs and optional metrics.
- Single Node process serving the SPA, REST API, uploads and WebSocket.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, Vite 8, TypeScript, Tailwind CSS 4 |
| Server | Node.js, Express 5, `ws` |
| Persistence | Node's built-in `node:sqlite` (SQLite, WAL mode) |
| Images | `multer` + `sharp` (validation, auto-orient, resize, metadata stripping) |
| Tests | Vitest, Node test server, Playwright multi-browser e2e |
| Dev tooling | `getownit` (not imported or used at runtime) |

## Quick start

Requirements: **Node.js 22.13 or newer** and npm. The `node:sqlite` module is used without an
experimental flag from that version onward.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>. The dev command runs two processes:

- Vite on `5173`, proxying `/api`, `/uploads`, `/defaults` and `/ws` to the server.
- The Node server on `8787` with SQLite and uploads in `./data`.

For a production-style run:

```bash
npm ci
npm run build
npm start
```

Open <http://localhost:8787>. `npm start` serves `dist/` and `dist-server/` from one process.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API/WebSocket server and Vite together. |
| `npm run dev:server` | Start only the server with `tsx watch`. |
| `npm run dev:web` | Start only Vite. |
| `npm run build` | Build the SPA into `dist/` and the server into `dist-server/`. |
| `npm start` | Run the built server (serves the SPA too). |
| `npm run typecheck` | Type-check the client and server projects. |
| `npm test` | Run the Vitest core, store, reducer, storage, backup and server/WebSocket tests. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run e2e` | Build, then run the Playwright flow (4 players, reconnect, zoom, QR). |
| `npm run admin -- list` | List rooms from the maintenance CLI. |
| `npm run admin -- delete <code>` | Delete a room and its upload (stop the server first). |
| `npm run admin -- prune` | Delete expired rooms and orphaned uploads. |
| `npm run admin -- stats` | Print room counts and upload disk usage. |
| `npm run admin:dev -- list` | Run the same CLI from TypeScript without building. |
| `npm run backup` | Snapshot SQLite and uploads into `backups/` (safe while running). |
| `npm run restore -- <dir>` | Restore a backup (stop the server first). |
| `npm run ownit` | Run the `getownit` CLI from this repo. |

The `admin` script uses `dist-server`; run `npm run build` first in a fresh checkout, or use
`npm run admin:dev` while developing. The backup and restore scripts run directly from `scripts/`.

## Configuration

Copy `.env.example` to `.env` for local use. The server, admin CLI and backup/restore scripts load
`.env` when they start; real environment variables can also be supplied by the shell or Docker.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP and WebSocket port. |
| `HOST` | `0.0.0.0` | Interface to bind. Use `127.0.0.1` behind a local proxy. |
| `DATA_DIR` | `./data` | SQLite database and `uploads/` directory. |
| `TRUST_PROXY` | unset | Set to `1` only behind a trusted reverse proxy that sets `X-Forwarded-For`. |
| `ROOM_TTL_DAYS` | `30` | Delete a room after this many days without activity. `0` disables expiry. |
| `HOST_TRANSFER_DAYS` | `14` | Give host rights to the most recently active member after the host is gone this long. `0` disables. |
| `MAINTENANCE_INTERVAL_MINUTES` | `60` | How often retention, host recovery and orphan cleanup run (minimum 1). |
| `ORPHAN_UPLOAD_GRACE_HOURS` | `24` | Age before an unreferenced upload file is deleted. `0` disables cleanup. |
| `MAX_TOTAL_UPLOAD_MB` | `2048` | Global disk budget for uploaded room images. |
| `MAX_ROOM_UPLOAD_MB` | `24` | Per-room upload budget (the current image, not lifetime uploads). |
| `METRICS_TOKEN` | unset | If set, `GET /api/metrics` requires `Authorization: Bearer <token>`. |
| `HSTS` | unset | Set to `1` behind HTTPS to send `Strict-Transport-Security`. |
| `LOG_LEVEL` | unset | Set to `silent` to suppress structured server logs. |

In development, keep `PORT=8787` unless you also update the proxy target in `vite.config.ts`.
`CHROMIUM_PATH` is an optional e2e-only override for the browser executable.

All limits are per process. Rate-limit buckets and realtime locks live in memory, which is another
reason to run a single app instance.

The app ships with no secrets or third-party API keys. `METRICS_TOKEN` is optional and supplied by
the environment. The `getownit` API key is only for the developer debrief tool and is stored outside
the app in `~/.ownit/config.json`.

## Docker

Build and run with Compose (the data volume survives container recreation):

```bash
docker compose up --build -d
docker compose logs -f
```

Open <http://localhost:8787>. To use another host port:

```bash
PUZZLE_PORT=9000 docker compose up --build -d
```

Or run the image directly:

```bash
docker build -t puzzle-together .
docker run --rm \
  --name puzzle-together \
  -p 8787:8787 \
  -v puzzle-data:/app/data \
  puzzle-together
```

The image runs as the non-root `node` user, exposes a `HEALTHCHECK` against `/api/health`, and
stores everything under `/app/data`. The SQLite database is `puzzle-together.db`; uploaded photos
are in `uploads/`.

Maintenance commands can run inside the image while the service is stopped:

```bash
docker compose stop
docker compose run --rm puzzle-together node dist-server/admin.js list
docker compose run --rm puzzle-together node dist-server/admin.js prune
docker compose start
```

### Reverse proxy

Put the container behind a TLS-terminating reverse proxy and forward WebSocket upgrades for `/ws`.
If the proxy sets `X-Forwarded-For`, run with `TRUST_PROXY=1` so rate limits see client addresses.
Example Caddy site block:

```caddyfile
puzzle.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

## How a room works

1. **Create.** Pick a name, a room name, an illustration or photo, and a piece count. The server
   stores the room, the host token hash and the image, then returns an invite link and token.
2. **Join.** The guest opens the link, chooses a display name, and receives a member token. Tokens
   are kept in `localStorage` per room, so a refresh rejoins the same seat automatically.
3. **Play.** Opening `/ws` authenticates the token and sends a snapshot. Grabbing a loose piece
   takes a server-side lock. Drags are broadcast but not persisted. Dropping near the home slot
   places the piece permanently; dropping elsewhere releases it back to the tray.
4. **Restart.** Any member can open **Start a new puzzle**, confirm, and choose a new image and/or
   piece count. The server increments the puzzle version, clears placements and locks, and
   broadcasts the new puzzle. Late drops from the old version are rejected.
5. **Delete.** Only the host can delete the room. Database rows, uploads and connected sockets are
   removed, and everyone is sent back to the home page.

Piece locks are owned by a socket, not a player, so closing a tab immediately releases whatever
that tab was holding. A 10-second heartbeat reaps dead connections, and cursors disappear after
4.5 seconds without movement. The browser reconnects immediately when the network returns or the
tab becomes visible, instead of waiting for the next backoff tick.

### Retention and host recovery

The maintenance loop runs at startup and then hourly. A room whose `updated_at` is older than
`ROOM_TTL_DAYS` is deleted, its upload removed, and any connected players are told the room closed.
Opening a room, joining, placing a piece or changing the puzzle counts as activity; previews do not.

If the host has not connected for `HOST_TRANSFER_DAYS` and another member has been active within
that window, the most recently active member becomes host. Everyone receives a `room_updated`
message, and the board, placements and locks are left untouched. If no member is active, the room is
left for the TTL sweeper. For a completely orphaned room, stop the server and use
`npm run admin -- delete <code>` (or `prune`).

## Architecture

```
shared/                 Pure contracts and puzzle logic (no React, DOM or Node)
  puzzle.ts             Grid selection, deterministic piece paths, tray order, snap check
  protocol.ts           REST/WebSocket DTOs and message types
  difficulty.ts         Presets, capacity, colours, snap tolerance
server/
  index.ts              Process bootstrap, static serving, graceful shutdown
  app.ts                REST routes, upload validation, rate limits, CSP, SPA fallback
  realtime.ts           Authoritative WebSocket hub, locks, drags, placements, presence
  store.ts              SQLite schema, rooms/players/placements, retention and host transfer
  images.ts             Upload validation, auto-orient, resize, re-encode, file cleanup
  storage.ts            Disk budgets and orphaned-upload pruning
  maintenance.ts        Background retention, host recovery and cleanup loop
  log.ts                Structured JSON logger
  admin.ts              Offline list/delete/prune/stats CLI
  session.ts            Codes, tokens, hashing, DTO mapping
src/
  pages/                Landing, create, join, room
  components/           Board, tray, dialogs, artwork, UI primitives
  state/                Pure client room reducer
  realtime/             WebSocket adapter and reconnect effects
tests/                  Core, store, reducer, storage, backup and server/WebSocket tests
scripts/e2e.mjs         Playwright end-to-end flow
scripts/backup.mjs      Consistent SQLite + uploads snapshot and restore helpers
```

The important boundary: `shared/` and `src/state/` are pure. The WebSocket hook and REST adapters
own effects; the reducer owns room state. The server validates every mutation, so a stale client
cannot place a piece from an old puzzle or move a piece it does not hold.

## API and realtime protocol

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness check used by Docker. |
| `GET /api/default-images` | The four bundled illustrations. |
| `GET /api/metrics` | Optional bearer-token operational metrics: rooms, players, placements, sockets, locks and disk usage. |
| `POST /api/rooms` | Create a room. Multipart: `hostName`, `roomName`, `pieceCount`, `imageKind` (`default` or `upload`), `defaultImageId`, or `image`. |
| `GET /api/rooms/:code/preview` | Name, host, image and piece count for the join screen. |
| `POST /api/rooms/:code/join` | Join or resume. JSON: `name`, optional `token`. |
| `POST /api/rooms/:code/puzzle` | Restart/change. Bearer token. Multipart: `pieceCount`, `imageKind` (`keep`, `default` or `upload`), image fields. |
| `DELETE /api/rooms/:code` | Host-only deletion. Bearer token. |
| `GET /uploads/:file`, `GET /defaults/:file` | Uploaded and bundled images. |
| `WS /ws` | One authenticated socket per player. |

The socket starts with `{ type: "hello", code, token }`. The server replies with a `snapshot`, then
broadcasts `players`, `cursor`, `piece_grabbed`, `piece_released`, `piece_drag`, `piece_drag_off`,
`piece_placed`, `puzzle_started`, `room_updated` and `room_deleted` messages. Every mutation carries
the puzzle `version`; invalid piece IDs, coordinates, versions and locks are rejected.

## Data and backups

Everything persistent is in `DATA_DIR`:

```
data/
  puzzle-together.db      SQLite database (WAL mode)
  puzzle-together.db-wal  WAL, when present
  puzzle-together.db-shm  Shared-memory file, when present
  uploads/                Uploaded JPEG/PNG/WebP files
```

### Automated local backups

`npm run backup` uses SQLite's `serialize()` to take a consistent snapshot while the server is
running, then copies `uploads/` and writes a manifest. Backups go to `backups/` by default:

```bash
npm run backup
# Backup written to /path/to/puzzletogether/backups/puzzle-together-2026-10-30T...

# Or choose a directory outside DATA_DIR.
npm run backup -- /mnt/backups/puzzle-together-2026-10-30
```

Run it from cron daily (the server can stay up):

```cron
15 3 * * * cd /srv/puzzletogether && DATA_DIR=/srv/puzzletogether/data npm run backup >> /var/log/puzzle-backup.log 2>&1
```

Restore with the server stopped:

```bash
npm run restore -- backups/puzzle-together-2026-10-30T03-15-00-000Z
```

Uploads must be backed up with the database because room rows reference their filenames. Uploaded
images are private photos: treat backups with the same care as the originals. Prune old backup
directories on whatever schedule suits your disk.

### Docker volume backup

```bash
docker compose stop
docker run --rm -v puzzle-together_puzzle-data:/data -v "$PWD/backup:/backup" \
  alpine sh -c 'tar czf /backup/puzzle-together-data.tgz -C /data .'
docker compose start
```

Restore by stopping the service, replacing the volume contents from the archive, and starting it
again.

## Testing

```bash
npm run typecheck
npm test
npm run e2e
```

`npm test` covers:

- deterministic piece generation, grid selection, exact counts, tray order and snapping;
- SQLite persistence, capacity, versions, TTL expiry, host transfer and placement queries;
- the pure client room reducer, including `room_updated` without board resets;
- upload budgets, orphan cleanup and backup/restore round-trips;
- REST validation, EXIF stripping, CSP/security headers, metrics auth, preview rate limits,
  WebSocket locks, drags, misses, placements, completion, presence, restart/stale versions and
  deletion.

`npm run e2e` builds first, starts a throwaway server on a free port with a temporary `DATA_DIR`,
and drives isolated Chromium contexts through:

> create → invite → join → presence → same-token second tab → fill all four seats → reject a
> fifth → QR invite → zoom/pan/reference/filter → server restart while holding a piece → drag
> ghost/cursor → drag placement → tap placement → refresh/rejoin → responsive widths → restart →
> complete all 12 pieces → celebration → host delete → everyone redirects → 404

It writes screenshots to `test-results/e2e/` (gitignored). It uses `/usr/bin/chromium` when
present, Playwright's browser otherwise, or `CHROMIUM_PATH=/path/to/chrome`.

## getownit

[`getownit`](https://github.com/Yoosseph/ownit) is installed as a **development-only** dependency
and is never imported by the app or server. It adds a pre-push debrief about what changed and why.

Current workspace status:

- `ownit login` is complete for GitHub user **Zwee42**.
- The pre-push hook is installed in `.git/hooks/pre-push`.
- No model API key is set yet (`ownit key status`).
- Repo registration is waiting for the Ownit GitHub App to be installed on
  `Zwee42/Coopuzzle` at <https://github.com/apps/ownit-app/installations/new>.
- The README badge above was generated with `ownit badge`.

Finish setup in a terminal with network and interactive access:

```bash
npx ownit login                       # GitHub device flow, if not already signed in
npx ownit key set                     # choose Nebius or NVIDIA, paste the key at the prompt
npx ownit init --repo Zwee42/Coopuzzle
```

Install the GitHub App on the repo first if `init` reports `app_not_installed`, then rerun
`init`. After that, a normal `git push` asks `Debrief now? [Y/n]`. The hook never blocks a push.
Use `OWNIT_SKIP=1 git push` to skip one debrief, or `npx ownit interview` to finish a pending one
later. See [`docs/getownit.md`](docs/getownit.md) for the full notes.

## Deployment notes

- Run **one** app instance. Piece locks, cursors and socket membership are process-local; SQLite is
  the durable state. Horizontal scaling would need a shared lock/broadcast layer.
- Terminate TLS at a reverse proxy and forward WebSocket upgrades. Keep the data volume on
  persistent storage with enough room for uploaded photos.
- `/api/health` is the container health endpoint. Graceful shutdown closes maintenance, the hub,
  the HTTP server and SQLite on `SIGINT`/`SIGTERM`.
- Uploads are capped at 12 MB on the server. The client downscales photos to 2400 px; the server
  auto-orients, downscales to 2400 px, re-encodes and strips EXIF/GPS metadata. JPEG, PNG and WebP
  are accepted; content, dimensions, animation and actual format are checked.
- Global and per-room upload budgets are enforced before writing. A maintenance loop deletes
  unreferenced upload files after a grace period.
- The server sets a restrictive CSP, `noindex`, `nosniff`, `DENY` framing, COOP/CORP and a
  permissions policy. Set `HSTS=1` only when TLS terminates in front of the app.
- Room creation/join/upload/preview routes have per-process rate limits.
- Server logs are JSON lines with request IDs, status, duration, room lifecycle, host transfers and
  WebSocket closes. Set `METRICS_TOKEN` to expose `/api/metrics` for a scraper.
- `.github/workflows/ci.yml` runs typecheck, unit/integration tests, build and the full Playwright
  flow on every push and pull request.

## Privacy and limits

Rooms are unlisted and never appear in a gallery, but they are not encrypted end-to-end. Anyone
with the invite link or room code can open the join screen, and anyone with an uploaded image URL
can fetch that image. Use TLS, keep links within your group, and delete rooms when you are done.
The host is the only person who can delete a room. The server re-encodes uploads to remove camera
metadata, but it cannot stop someone who already has the image URL from viewing the photo.

This version does not include accounts, chat, piece rotation, cropping before upload, public
discovery, notifications, or multi-instance/S3 deployment. It also does not encrypt uploads at
rest; use full-disk encryption if that matters for your deployment. See `PLAN.md` for the full scope
and acceptance criteria.
