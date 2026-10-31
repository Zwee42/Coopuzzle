# Puzzle Together — Plan

## Goal

Build a private, persistent jigsaw room where a small group (2–4 people) can work on the
same puzzle together, in real time, with no account required. One person creates a room,
picks a bundled image or uploads a photo, and chooses a piece count. The room lives at an
invite link until its host deletes it or it expires after a period of inactivity. Every drag,
grab, placement, cursor and presence change is broadcast over a single WebSocket connection
and reconciled server-side.

## Design decisions

| Area | Decision |
|---|---|
| Stack | React 19 + Vite 8 + TypeScript + Tailwind CSS 4. Node/Express/`ws` server in the same repo. |
| Realtime | One WebSocket per player at `/ws`; server-authoritative piece locks and placement. REST only for room creation, joins, uploads, restarts and deletion. |
| State | Pure shared puzzle core; client room reducer; WebSocket/API effects live in hooks/adapters. No runtime use of `getownit`. |
| Rooms | 7-character unlisted code. Private rooms, no gallery. Guests choose a display name. Tokens live in `localStorage` per room. |
| Members | Up to **4** members per room; a fifth new member is rejected. Returning members with a valid token can rejoin. |
| Persistence | SQLite via Node's built-in `node:sqlite`, plus uploads in `data/uploads`. No in-memory-only rooms. |
| Identity | No accounts. Each member gets a random session token stored hashed in SQLite. The creator starts as host; an inactive host can be replaced automatically. |
| Images | 4 original bundled SVG illustrations, plus JPEG/PNG/WebP uploads (client resized to max 2400 px; server validated, auto-oriented, downscaled and re-encoded with `sharp`, stripping EXIF/GPS). Default images require no upload. |
| Puzzle | Classic interlocking tabs, no rotation. Pieces are generated deterministically from a seed. Puzzle presets: **12, 24, 48, 80, 120, 200, 300** pieces; exact count shown. |
| Board | Loose pieces live in a tray (right on desktop, below on mobile) with All/Edges/Corners filters. Drag onto the board; a piece within 0.9 cell of its home slot snaps and locks. The board supports 1–3× zoom, pan, a floating reference picture and a full preview. |
| Turn flow | No timer, no score. Both members can restart/change the puzzle. The initiator confirms; the server broadcasts the new puzzle to everyone. |
| Rooms lifecycle | Persist until the host deletes the room or it is inactive for 30 days (configurable). Deleting removes the room, members, placements and any uploaded image file. A host absent for 14 days is replaced by the most recently active member. |
| Presence | Shared cursors while over the board, online dots, live drag ghosts, piece locks. Cursors expire after ~4 s of inactivity. |
| Art | Cozy romantic: cream paper, warm terracotta/rose, sage, plum ink, Fraunces display type, soft grain and restrained motion. Responsive phone/tablet/desktop. |
| Deployment | Single Node process serving the built SPA, REST and WebSocket. Dockerfile + compose volume. One instance only (realtime locks, rate-limit buckets and maintenance are process-local; persisted state is in SQLite). |
| Errors | Room-not-found, room-full, invalid upload, reconnect, partner disconnect, and "piece already held" states are explicit; no silent failures. |

## Rules

| Event | Result |
|---|---|
| Create room | Validate name, image and piece preset; persist room + host token; return invite link. |
| Join room | If token is valid and belongs to the room, restore that member. Otherwise create a member if under cap. |
| Open socket | Authenticate member token; send a full snapshot; mark member online. |
| Grab loose piece | Allowed if unplaced and unlocked. Lock is owned by that socket. Others cannot grab it. |
| Drag piece | Only the lock owner may send positions; positions are broadcast but not persisted. |
| Drop within 0.9 cell of home slot | Piece is placed, persisted, lock released, progress broadcast; if it completes the puzzle, celebrate. |
| Drop elsewhere / cancel | Lock released; piece stays loose. |
| Disconnect while holding pieces | Release that socket's locks immediately. |
| Restart puzzle | Any member, after client-side confirmation. New version + seed, clear placements and locks, broadcast. Old uploaded image is deleted. |
| Delete room | Host only. Remove database rows, uploaded file, sockets and clients. |
| Inactive host | After `HOST_TRANSFER_DAYS`, promote the most recently active member. Board, placements and locks are untouched. |
| Inactive room | After `ROOM_TTL_DAYS`, delete the room, players, placements and upload; notify connected clients. |
| Reconnect | Retry with backoff and the same token; reconnect immediately on network return or a visible tab; receive current snapshot. No duplicate version or stale placement can be applied. |

## Implementation notes

- **Pure core:** `shared/puzzle.ts` imports no React, DOM or Node. It selects grid dimensions,
  validates preset counts, generates deterministic interlocking paths and checks snapping.
  `shared/protocol.ts` and `shared/defaults.ts` are the contract between client and server.
- **Deterministic tabs:** each internal edge gets a seeded tab side/position/width/depth.
  Adjacent pieces traverse the same sampled edge in opposite directions, so their outlines match.
- **Board coordinates:** piece slots are addressed in a `rows × cols` grid. Drop points are
  normalized `(0..1, 0..1)` in board space; distance is measured in cell units.
- **Data shape:** placed pieces are a set keyed by `pieceId`, never an array with positional gaps.
  The tray order is a seeded permutation, then filtered by placed state.
- **Versioning:** every puzzle has a room version. Placement/restart operations carry the version
  so a late drop from the previous puzzle is rejected.
- **Upload safety:** MIME allowlist, 12 MB request cap, `sharp` format/dimension/pixel checks,
  auto-orient, 2400 px output cap, metadata stripping, UUID filename, no user-controlled paths.
  Uploads are served unlisted with private long-lived cache headers. The client downscales before
  upload. Global and per-room byte budgets are checked under a serialized upload lock; orphaned
  files are pruned after a grace period.
- **Tokens:** 32-byte random tokens, SHA-256 at rest. Never log tokens.
- **WebSocket validation:** max payload 32 KB; validate room membership, puzzle version, piece
  IDs and coordinate ranges for every mutation. Heartbeats reap dead clients.
- **Reconnect UX:** connection state is visible. In-flight local drags reset on disconnect;
  server state wins after snapshot. A 10-second heartbeat reaps dead sockets, and the browser
  reconnects immediately when the network returns or the tab becomes visible.
- **Operations:** a maintenance loop handles retention, host recovery and orphan cleanup. An
  offline admin CLI lists/deletes/prunes rooms. `scripts/backup.mjs` snapshots SQLite plus uploads
  and verifies the pair; restore replaces uploads and removes stale WAL/SHM files. Structured JSON
  logs and optional token-protected metrics support a single-instance deployment.
- **Accessibility:** piece cards are buttons and keyboard-selectable; selected piece can be
  placed by clicking/tapping the board. Dialogs use native `<dialog>`, focus returns to the
  trigger. Reduced-motion removes celebratory and snap animations.
- **Device fit:** board measures its container with `ResizeObserver` and fits by aspect ratio;
  no fixed pixel dimensions. A mobile warning appears for 200+ pieces.

## Acceptance criteria

- [x] Home page offers create and join; joining a valid code that has no saved identity asks for a name.
- [x] Creating a room with each default image and each preset produces exactly that many pieces.
- [x] Uploading a photo (JPEG/PNG/WebP) shows a preview, creates a room, and the image survives a server restart.
- [x] Invite link opened in a second browser joins the same room with a different member name and color.
- [x] Two open browsers see each other's presence dot/cursor and live piece drags.
- [x] A piece grabbed by one player cannot be grabbed by the other until released or placed.
- [x] Dropping a piece near its slot makes it appear and become non-draggable in both browsers.
- [x] Dropping a piece far from its slot leaves it in the tray and releases the lock.
- [x] Refreshing either browser rejoins automatically with its saved token and retains placements.
- [x] A third and fourth member can join; a fifth new member is refused with a clear message.
- [x] Restarting a puzzle resets placements in both browsers and swaps image/difficulty if changed.
- [x] The host can delete the room; the other browser is redirected out of the room immediately.
- [x] Completion is shown only after every piece is placed, with a celebration and a next-puzzle action.
- [x] Layout has no horizontal overflow at 390 px, 768 px, 1024 px and 1440 px widths.
- [x] Board zoom/pan, reference picture and tray filters work without scrolling the page.
- [x] Invite dialog shows a QR code for the room link.
- [x] A restarted server reconnects clients without a phantom placement while a piece is held.
- [x] Expired rooms and orphaned uploads are pruned; a quiet host is replaced without clearing the board.
- [x] Backups restore SQLite and uploads together; admin commands cover list/delete/prune/stats.
- [x] `npm test` passes core, store, storage, backup and server/WebSocket tests; `npm run e2e` passes the multi-browser flow.
- [x] `getownit` is installed and configured as far as this environment allows; manual login/remote steps are documented.

## Out of scope for this version

- Accounts, email, password reset, public profiles.
- Public room discovery, likes, comments, chat, leaderboards, timers or scoring.
- Piece rotation, image cropping before upload, GIF/video uploads.
- Moderation/reporting; rooms are invite-only and images are unlisted.
- Horizontal scaling (multiple Node instances), S3/CDN, S3-compatible object storage.
- End-to-end encryption or encryption at rest; uploaded images are unlisted but URL-accessible.
- Native apps, offline play, push notifications.
