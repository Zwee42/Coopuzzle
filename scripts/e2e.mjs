/**
 * Multi-browser end-to-end test for Puzzle Together.
 *
 * It builds nothing: run `npm run build` first (the `npm run e2e` script does it
 * for you), then this script starts a throwaway server with its own SQLite data
 * directory and drives isolated Chromium contexts through the full flow:
 *
 *   create → invite → four seats → QR → zoom/filter → connection drop →
 *   drag → tap → refresh → restart → delete
 *
 * Set CHROMIUM_PATH to override the browser executable.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const artifactsDir = join(root, "test-results", "e2e");
const serverOutput = [];
const consoleErrors = [];

function log(message) {
  console.log(`\u2022 ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
  });
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Server did not become healthy at ${baseUrl}`);
}

function launchServer(port, dataDir) {
  const child = spawn(process.execPath, ["dist-server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveStop();
    }, 4_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
}

async function waitForHeaderProgress(page, progress, timeout = 12_000) {
  await page.waitForFunction(
    (expected) => document.querySelector("header")?.textContent?.includes(expected) ?? false,
    progress,
    { timeout },
  );
}

async function waitForHere(page, count, timeout = 12_000) {
  await page.waitForFunction(
    (expected) => document.querySelector("header")?.textContent?.includes(`${expected} here`) ?? false,
    count,
    { timeout },
  );
}

async function joinAs(page, base, code, name) {
  await page.goto(`${base}/join/${code}`, { waitUntil: "networkidle" });
  await page.locator("#join-name").waitFor({ state: "visible" });
  await page.locator("#join-name").fill(name);
  await page.getByRole("button", { name: "Take my seat" }).click();
  await page.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15_000 });
  await page.waitForSelector('[data-testid="puzzle-board"]');
}

function trackPage(page, label) {
  page.on("pageerror", (error) => {
    consoleErrors.push(`[${label}] page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The deliberate server restart in the reconnect test produces these.
    if (/WebSocket connection|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(message.text())) return;
    consoleErrors.push(`[${label}] console: ${message.text()}`);
  });
}

function parsePieceTestId(testId) {
  const match = /^tray-piece-r(\d+)c(\d+)$/.exec(testId ?? "");
  if (!match) throw new Error(`Could not parse piece id from ${String(testId)}`);
  return { row: Number(match[1]), col: Number(match[2]) };
}

async function firstTrayPiece(page) {
  const piece = page.locator('[data-testid^="tray-piece-"]').first();
  await piece.waitFor({ state: "visible" });
  await piece.scrollIntoViewIfNeeded();
  const testId = await piece.getAttribute("data-testid");
  const { row, col } = parsePieceTestId(testId);
  const board = page.locator('[data-testid="puzzle-board"]');
  const rows = Number(await board.getAttribute("data-rows"));
  const cols = Number(await board.getAttribute("data-cols"));
  const boardBox = await board.boundingBox();
  const pieceBox = await piece.boundingBox();
  if (!boardBox || !pieceBox) throw new Error("Could not measure the board or tray piece");
  return {
    testId,
    piece,
    board,
    start: { x: pieceBox.x + pieceBox.width / 2, y: pieceBox.y + pieceBox.height / 2 },
    target: {
      x: boardBox.x + ((col + 0.5) / cols) * boardBox.width,
      y: boardBox.y + ((row + 0.5) / rows) * boardBox.height,
    },
  };
}

async function dragFirstPiece(page, expectedProgress, observerPage) {
  const { testId, start, target } = await firstTrayPiece(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  for (let step = 1; step <= 16; step++) {
    await page.mouse.move(
      start.x + ((target.x - start.x) * step) / 16,
      start.y + ((target.y - start.y) * step) / 16,
    );
    await page.waitForTimeout(18);
  }
  if (observerPage) {
    const ghost = observerPage.locator('[data-testid="remote-drag"]');
    await ghost.waitFor({ state: "visible", timeout: 5_000 });
    assert(
      (await ghost.first().innerText()).includes("Maya"),
      "The other player should see the drag ghost with the dragger's name",
    );
  }
  await page.mouse.up();
  await waitForHeaderProgress(page, expectedProgress);
  return testId;
}

async function tapFirstPiece(page, expectedProgress) {
  const { testId, start, target } = await firstTrayPiece(page);
  await page.mouse.click(start.x, start.y);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-testid="tray-piece-${id}"]`)
        ?.getAttribute("aria-pressed") === "true",
    testId.replace(/^tray-piece-/, ""),
    { timeout: 6_000 },
  );
  await page.mouse.click(target.x, target.y);
  await waitForHeaderProgress(page, expectedProgress);
  assert(
    (await page.locator(`[data-testid="${testId}"]`).count()) === 0,
    `Placed piece ${testId} should leave the tray`,
  );
  return testId;
}

async function checkNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert(overflow <= 1, `${label} overflows horizontally by ${overflow}px`);
}

async function main() {
  if (!existsSync(join(root, "dist", "index.html")) || !existsSync(join(root, "dist-server", "index.js"))) {
    throw new Error("Build output is missing. Run `npm run build` before the e2e test.");
  }

  await mkdir(artifactsDir, { recursive: true });
  const dataDir = await mkdtemp(join(tmpdir(), "puzzle-together-e2e-"));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let server = launchServer(port, dataDir);

  let browser;
  let hostContext;
  let guestContext;
  try {
    await waitForHealth(base);
    log(`throwaway server ready at ${base}`);

    const executablePath =
      process.env.CHROMIUM_PATH ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox"],
    });
    hostContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    guestContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    trackPage(host, "host");
    trackPage(guest, "guest");

    // --- Create ------------------------------------------------------------
    await host.goto(`${base}/create`, { waitUntil: "networkidle" });
    await host.getByLabel("Your name", { exact: true }).fill("Maya");
    await host.getByLabel(/Room name/).fill("Sunday together");
    await host.getByRole("button", { name: /^24\b/ }).click();
    await host.getByRole("button", { name: "Create our room" }).click();
    await host.waitForURL(/\/room\/[A-Z0-9]{7}$/, { timeout: 15_000 });
    const code = new URL(host.url()).pathname.split("/").pop();
    assert(code && code.length === 7, "Room code should be seven characters");
    await host.waitForSelector('[data-testid="puzzle-board"]');
    await waitForHeaderProgress(host, "0/24 pieces");
    log(`created room ${code} with 24 pieces`);

    // --- Join + presence ---------------------------------------------------
    await guest.goto(`${base}/join/${code}`, { waitUntil: "networkidle" });
    await guest.locator("#join-name").waitFor({ state: "visible" });
    await guest.locator("#join-name").fill("Theo");
    await guest.getByRole("button", { name: "Take my seat" }).click();
    await guest.waitForURL(new RegExp(`/room/${code}$`), { timeout: 15_000 });
    await guest.waitForSelector('[data-testid="puzzle-board"]');
    await waitForHeaderProgress(guest, "0/24 pieces");
    await waitForHere(host, 2);
    await waitForHere(guest, 2);
    log("guest joined and both browsers see two people present");

    // --- Two tabs, same saved session ------------------------------------
    const hostSecond = await hostContext.newPage();
    trackPage(hostSecond, "host-second-tab");
    await hostSecond.goto(`${base}/room/${code}`, { waitUntil: "networkidle" });
    await hostSecond.waitForSelector('[data-testid="puzzle-board"]');
    await waitForHeaderProgress(hostSecond, "0/24 pieces");
    await waitForHere(hostSecond, 2);
    await hostSecond.getByText("Sunday together").waitFor({ state: "visible" });
    await hostSecond.close();
    log("a second tab restored the same host session without taking another seat");

    // --- Four seats, fifth rejected --------------------------------------
    const guest2Context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const guest3Context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const guest2 = await guest2Context.newPage();
    const guest3 = await guest3Context.newPage();
    trackPage(guest2, "guest-2");
    trackPage(guest3, "guest-3");
    await joinAs(guest2, base, code, "June");
    await joinAs(guest3, base, code, "Kai");
    await waitForHere(host, 4);
    await waitForHere(guest, 4);

    const fifthContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const fifth = await fifthContext.newPage();
    trackPage(fifth, "fifth");
    await fifth.goto(`${base}/join/${code}`, { waitUntil: "networkidle" });
    await fifth.getByText("This room is full.").waitFor({ state: "visible" });
    assert(await fifth.locator("#join-name").isDisabled(), "Full-room form should be disabled");
    const fifthResponse = await fetch(`${base}/api/rooms/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    assert(fifthResponse.status === 409, "The API should reject a fifth player");
    assert(
      (await fifthResponse.json()).error.code === "room_full",
      "A fifth player should receive room_full",
    );
    await fifth.close();
    await fifthContext.close();
    log("all four seats filled and a fifth player was turned away");

    // --- QR invite --------------------------------------------------------
    await host.getByRole("button", { name: "Invite someone" }).click();
    const inviteDialog = host.locator("dialog[open]");
    await inviteDialog.waitFor({ state: "visible" });
    await inviteDialog.locator('[data-testid="invite-qr"]').waitFor({ state: "visible" });
    assert(
      (await inviteDialog.locator('[data-testid="invite-qr"] svg').count()) === 1,
      "Invite dialog should render a QR code",
    );
    await inviteDialog.getByRole("button", { name: "Done" }).click();
    log("invite dialog rendered a scannable QR code");

    // --- Zoom, pan, reference and tray filters ----------------------------
    const board = host.locator('[data-testid="puzzle-board"]');
    const baseBoardBox = await board.boundingBox();
    assert(baseBoardBox, "Board should have a measurable box");
    const scrollBeforeWheel = await host.evaluate(() => window.scrollY);
    await host.mouse.move(
      baseBoardBox.x + baseBoardBox.width / 2,
      baseBoardBox.y + baseBoardBox.height / 2,
    );
    await host.mouse.wheel(0, -120);
    await host.waitForTimeout(140);
    const wheelBoardBox = await board.boundingBox();
    assert(
      wheelBoardBox && wheelBoardBox.width > baseBoardBox.width * 1.05,
      "Mouse wheel should zoom the board",
    );
    assert(
      (await host.evaluate(() => window.scrollY)) === scrollBeforeWheel,
      "Mouse wheel zoom must not scroll the page",
    );
    await host.getByRole("button", { name: "Reset board view" }).click();
    await host.waitForTimeout(120);
    await host.getByRole("button", { name: "Zoom in" }).click();
    await host.waitForTimeout(140);
    const zoomedBoardBox = await board.boundingBox();
    assert(
      zoomedBoardBox && zoomedBoardBox.width > baseBoardBox.width * 1.1,
      "Zoom in should enlarge the board",
    );

    await host.getByRole("button", { name: "Show reference picture" }).click();
    await host.locator('[data-testid="reference-image"]').waitFor({ state: "visible" });
    await host.getByRole("button", { name: "Hide reference picture" }).click();
    await host.locator('[data-testid="reference-image"]').waitFor({ state: "hidden" });

    const panBefore = await board.boundingBox();
    assert(panBefore, "Zoomed board should have a measurable box");
    await host.mouse.move(
      panBefore.x + panBefore.width / 2,
      panBefore.y + panBefore.height / 2,
    );
    await host.mouse.down();
    await host.mouse.move(
      panBefore.x + panBefore.width / 2 + 42,
      panBefore.y + panBefore.height / 2 + 24,
      { steps: 5 },
    );
    await host.mouse.up();
    await host.waitForTimeout(100);
    const panAfter = await board.boundingBox();
    assert(panAfter && Math.abs(panAfter.x - panBefore.x) > 5, "Dragging should pan the board");

    await host.getByRole("button", { name: "Reset board view" }).click();
    await host.waitForTimeout(120);
    const resetBoardBox = await board.boundingBox();
    assert(
      resetBoardBox && Math.abs(resetBoardBox.width - baseBoardBox.width) < 2,
      "Reset should restore the fitted board size",
    );

    await host.getByTestId("tray-filter-corners").click();
    assert(
      (await host.getByTestId("tray-filter-corners").getAttribute("aria-pressed")) === "true",
      "Corner filter should be active",
    );
    const cornerTrayCount = await host.locator('[data-testid^="tray-piece-"]').count();
    assert(cornerTrayCount > 0 && cornerTrayCount <= 4, "Corner filter should show at most four pieces");
    await host.getByTestId("tray-filter-all").click();
    assert(
      (await host.locator('[data-testid^="tray-piece-"]').count()) === 24,
      "Clearing the filter should show all loose pieces",
    );
    log("zoom, pan, reference toggle and tray filters work");

    // --- Connection drop while holding a piece ----------------------------
    const interrupted = await firstTrayPiece(host);
    await host.mouse.move(interrupted.start.x, interrupted.start.y);
    await host.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await host.mouse.move(
        interrupted.start.x + ((interrupted.target.x - interrupted.start.x) * step) / 10,
        interrupted.start.y + ((interrupted.target.y - interrupted.start.y) * step) / 10,
      );
      await host.waitForTimeout(20);
    }
    await guest.locator('[data-testid="remote-drag"]').waitFor({ state: "visible", timeout: 5_000 });
    await stopServer(server);
    await host.getByText("Reconnecting").waitFor({ state: "visible", timeout: 12_000 });
    server = launchServer(port, dataDir);
    await waitForHealth(base);
    await host.getByText("Live").waitFor({ state: "visible", timeout: 20_000 });
    await guest.getByText("Live").waitFor({ state: "visible", timeout: 20_000 });
    await guest.locator('[data-testid="remote-drag"]').waitFor({ state: "hidden", timeout: 15_000 });
    await host.mouse.up();
    await host.waitForTimeout(300);
    await waitForHeaderProgress(host, "0/24 pieces");
    assert(
      (await host.locator(`[data-testid="${interrupted.testId}"]`).count()) === 1,
      "A connection drop while holding a piece must not place it",
    );
    log("a server restart while holding a piece reconnected cleanly without a phantom placement");

    // --- Drag placement ----------------------------------------------------
    const hostPiece = await dragFirstPiece(host, "1/24 pieces", guest);
    await waitForHeaderProgress(guest, "1/24 pieces");
    assert(
      (await guest.locator(`[data-testid="${hostPiece}"]`).count()) === 0,
      "The guest should see the placed piece leave the tray",
    );
    const hostBoard = await host.locator('[data-testid="puzzle-board"]').boundingBox();
    await host.mouse.move(
      hostBoard.x + hostBoard.width * 0.34,
      hostBoard.y + hostBoard.height * 0.46,
    );
    await guest.locator('[data-testid="remote-cursor"]').waitFor({ state: "visible", timeout: 5_000 });
    log("guest sees the host's live drag ghost and cursor");

    // --- Tap-to-select placement from the other player ---------------------
    await tapFirstPiece(guest, "2/24 pieces");
    await waitForHeaderProgress(host, "2/24 pieces");
    log("tap-select placement reached both browsers");

    // --- Refresh/rejoin persistence ---------------------------------------
    await guest.reload({ waitUntil: "networkidle" });
    await guest.waitForSelector('[data-testid="puzzle-board"]');
    await waitForHeaderProgress(guest, "2/24 pieces");
    await waitForHere(guest, 4);
    log("guest refresh re-joined automatically with placements intact");

    // --- Responsive layout -------------------------------------------------
    for (const width of [390, 768, 1024, 1440]) {
      await host.setViewportSize({ width, height: width < 700 ? 844 : 950 });
      await host.waitForTimeout(220);
      await checkNoHorizontalOverflow(host, `room at ${width}px`);
    }
    await host.setViewportSize({ width: 1440, height: 950 });
    const home = await hostContext.newPage();
    trackPage(home, "home");
    await home.goto(`${base}/`, { waitUntil: "networkidle" });
    for (const width of [390, 768, 1024, 1440]) {
      await home.setViewportSize({ width, height: width < 700 ? 844 : 950 });
      await home.waitForTimeout(220);
      await checkNoHorizontalOverflow(home, `home at ${width}px`);
    }
    await home.close();
    log("no horizontal overflow at 390, 768, 1024 and 1440px");

    // --- Restart with a new piece count, keeping the image -----------------
    await host.getByRole("button", { name: "Start a new puzzle" }).click();
    const restartDialog = host.locator("dialog[open]");
    await restartDialog.waitFor({ state: "visible" });
    await restartDialog.getByRole("button", { name: /^12\b/ }).click();
    await restartDialog.getByRole("button", { name: "Start fresh" }).click();
    await waitForHeaderProgress(host, "0/12 pieces");
    await waitForHeaderProgress(guest, "0/12 pieces");
    assert(
      (await host.locator('[data-testid^="tray-piece-"]').count()) === 12,
      "Host should have 12 loose pieces after the restart",
    );
    assert(
      (await guest.locator('[data-testid^="tray-piece-"]').count()) === 12,
      "Guest should have 12 loose pieces after the restart",
    );
    assert(
      (await host.locator(".piece-arrive").count()) === 0,
      "The restarted board should be empty",
    );
    log("restart reset the board to 12 pieces for both players");

    // --- Play the 12-piece puzzle to completion ---------------------------
    for (let count = 1; count <= 12; count++) {
      await tapFirstPiece(host, `${count}/12 pieces`);
      await waitForHeaderProgress(guest, `${count}/12 pieces`);
      if (count === 11) {
        assert(
          (await host.getByText("Every piece found its home.").count()) === 0,
          "The completion overlay must not appear before the last piece",
        );
      }
    }
    await host.getByText("Every piece found its home.").waitFor({ state: "visible" });
    await guest.getByText("Every piece found its home.").waitFor({ state: "visible" });
    await host.screenshot({ path: join(artifactsDir, "room-complete.png") });
    await host.getByRole("button", { name: "Admire it" }).click();
    await host.getByText("Every piece found its home.").waitFor({ state: "hidden" });
    await guest.getByRole("button", { name: "Admire it" }).click();
    await guest.getByText("Every piece found its home.").waitFor({ state: "hidden" });
    await host.locator("header").getByText("Live", { exact: true }).waitFor();
    await guest.locator("header").getByText("Live", { exact: true }).waitFor();
    log("all 12 pieces completed the puzzle and both players saw the celebration");

    // --- Delete as host ----------------------------------------------------
    await host.getByRole("button", { name: "Room menu" }).click();
    await host.getByRole("menuitem", { name: "Delete room" }).click();
    const deleteDialog = host.locator("dialog[open]");
    await deleteDialog.waitFor({ state: "visible" });
    await deleteDialog.getByRole("button", { name: "Delete forever" }).click();
    await host.waitForURL((url) => url.pathname === "/", { timeout: 12_000 });
    await guest.waitForURL((url) => url.pathname === "/", { timeout: 12_000 });
    await host.getByText("Your room has been put away.").waitFor({ state: "visible" });
    await guest.getByText("That room was closed by its host.").waitFor({ state: "visible" });
    const deletedPreview = await fetch(`${base}/api/rooms/${code}/preview`);
    assert(deletedPreview.status === 404, "Deleted room should return 404");
    log("host deletion closed the room and redirected both players");

    await guest.screenshot({ path: join(artifactsDir, "home-after-delete.png") });

    assert(consoleErrors.length === 0, `Browser errors:\n${consoleErrors.join("\n")}`);
    console.log(
      "\nE2E passed: create → join → four seats → QR → zoom/pan/filter → connection drop → drag → tap → refresh → restart → delete",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(server);
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    if (consoleErrors.length > 0) {
      console.error("\nBrowser console errors:");
      for (const message of consoleErrors) console.error(`  ${message}`);
    }
    if (serverOutput.length > 0) {
      console.log("\nServer output:");
      for (const line of serverOutput) process.stdout.write(line);
    }
  }
}

main().catch((error) => {
  console.error(`\nE2E failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
