/**
 * Two-browser end-to-end test for Puzzle Together.
 *
 * It builds nothing: run `npm run build` first (the `npm run e2e` script does it
 * for you), then this script starts a throwaway server with its own SQLite data
 * directory and drives two isolated Chromium contexts through the full flow:
 *
 *   create → invite → join → presence → drag → tap → refresh → restart → delete
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

function trackPage(page, label) {
  page.on("pageerror", (error) => {
    consoleErrors.push(`[${label}] page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`[${label}] console: ${message.text()}`);
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
  const server = spawn(process.execPath, ["dist-server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => serverOutput.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverOutput.push(String(chunk)));

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
    await waitForHere(guest, 2);
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
    await guest.getByRole("button", { name: "Admire it" }).click();
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
    console.log("\nE2E passed: create → join → presence → drag → tap → refresh → restart → delete");
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    await new Promise((resolveWait) => {
      const timer = setTimeout(() => {
        server.kill("SIGKILL");
        resolveWait();
      }, 4_000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolveWait();
      });
    });
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
