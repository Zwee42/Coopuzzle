import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGES } from "../shared/defaults";
import {
  DIFFICULTIES,
  PIECE_TARGETS,
  SNAP_TOLERANCE_CELLS,
  isPieceTarget,
  type PieceTarget,
} from "../shared/difficulty";
import {
  PIECE_VIEWBOX_MARGIN,
  distanceToSlotInCells,
  generatePuzzle,
  isDropNearSlot,
  isPointOnBoard,
  mulberry32,
  parsePieceId,
  pieceId,
  pieceSlotCenter,
  pieceViewBox,
  selectGrid,
} from "../shared/puzzle";

describe("difficulty presets", () => {
  it("offers exactly the seven requested piece counts", () => {
    expect(PIECE_TARGETS).toEqual([12, 24, 48, 80, 120, 200, 300]);
    expect(DIFFICULTIES).toHaveLength(7);
  });

  it("recognises only preset counts", () => {
    for (const count of PIECE_TARGETS) expect(isPieceTarget(count)).toBe(true);
    for (const count of [0, 13, 25, 301, 12.5, "24", null]) {
      expect(isPieceTarget(count)).toBe(false);
    }
  });
});

describe("selectGrid", () => {
  it("always produces the exact preset piece count", () => {
    for (const target of PIECE_TARGETS) {
      for (const aspect of [0.5, 0.8, 1, 1.6, 2.4]) {
        const grid = selectGrid(target, aspect);
        expect(grid.rows * grid.cols).toBe(target);
        expect(grid.rows).toBeGreaterThanOrEqual(2);
        expect(grid.cols).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps every bundled image at an exact preset count", () => {
    for (const image of DEFAULT_IMAGES) {
      for (const target of PIECE_TARGETS) {
        const grid = selectGrid(target, image.width / image.height);
        expect(grid.rows * grid.cols).toBe(target);
      }
    }
  });

  it("picks a landscape grid for a landscape picture", () => {
    expect(selectGrid(24, 1600 / 1000)).toMatchObject({ rows: 4, cols: 6 });
    expect(selectGrid(12, 1600 / 1000)).toMatchObject({ rows: 3, cols: 4 });
  });

  it("picks a portrait grid for a portrait picture", () => {
    const grid = selectGrid(24, 0.5);
    expect(grid.cols).toBeLessThan(grid.rows);
  });

  it("rejects non-preset counts", () => {
    expect(() => selectGrid(13 as PieceTarget, 1.6)).toThrow(/Unsupported piece target/);
  });
});

describe("generatePuzzle", () => {
  it("is deterministic for the same seed and grid", () => {
    const first = generatePuzzle(4, 6, 123456);
    const second = generatePuzzle(4, 6, 123456);
    expect(first.pieces.map((piece) => piece.path)).toEqual(
      second.pieces.map((piece) => piece.path),
    );
    expect(first.trayOrder).toEqual(second.trayOrder);
  });

  it("changes the cut for a different seed", () => {
    const first = generatePuzzle(4, 6, 1);
    const second = generatePuzzle(4, 6, 2);
    expect(first.pieces[0].path).not.toBe(second.pieces[0].path);
  });

  it("creates every piece exactly once with valid identifiers and paths", () => {
    const puzzle = generatePuzzle(5, 8, 42);
    expect(puzzle.pieces).toHaveLength(40);
    expect(puzzle.piecesById.size).toBe(40);
    expect(new Set(puzzle.trayOrder)).toEqual(new Set(puzzle.pieces.map((piece) => piece.id)));

    for (const piece of puzzle.pieces) {
      expect(piece.id).toBe(pieceId(piece.row, piece.col));
      expect(piece.path.startsWith("M")).toBe(true);
      expect(piece.path.endsWith("Z")).toBe(true);
      expect(piece.path).toMatch(/^M[-0-9. LZ]+$/);
    }
  });

  it("returns a tray order that is a real shuffle of the pieces", () => {
    const puzzle = generatePuzzle(4, 6, 7);
    expect(puzzle.trayOrder).toHaveLength(24);
    expect(puzzle.trayOrder).not.toEqual(puzzle.pieces.map((piece) => piece.id));
  });

  it("rejects invalid grids", () => {
    expect(() => generatePuzzle(1, 12, 1)).toThrow(/at least 2 rows/);
    expect(() => generatePuzzle(2.5, 4, 1)).toThrow(/at least 2 rows/);
    expect(() => generatePuzzle(20, 21, 1)).toThrow(/too large/);
  });
});

describe("piece helpers", () => {
  it("parses valid piece ids and rejects out-of-range ids", () => {
    expect(parsePieceId("r2c5", 4, 6)).toEqual({ row: 2, col: 5 });
    expect(parsePieceId("r0c0", 4, 6)).toEqual({ row: 0, col: 0 });
    expect(parsePieceId("r4c0", 4, 6)).toBeNull();
    expect(parsePieceId("r0c6", 4, 6)).toBeNull();
    expect(parsePieceId("r-1c0", 4, 6)).toBeNull();
    expect(parsePieceId("piece", 4, 6)).toBeNull();
  });

  it("computes slot centers in normalized board space", () => {
    expect(pieceSlotCenter({ row: 0, col: 0 }, 4, 6)).toEqual({ x: 1 / 12, y: 1 / 8 });
    expect(pieceSlotCenter({ row: 3, col: 5 }, 4, 6)).toEqual({ x: 11 / 12, y: 7 / 8 });
  });

  it("measures distance in cell units", () => {
    const center = pieceSlotCenter({ row: 1, col: 2 }, 4, 6);
    expect(distanceToSlotInCells(center, { row: 1, col: 2 }, 4, 6)).toBe(0);
    expect(
      distanceToSlotInCells({ x: center.x + 0.5 / 6, y: center.y }, { row: 1, col: 2 }, 4, 6),
    ).toBeCloseTo(0.5);
    expect(
      distanceToSlotInCells({ x: center.x, y: center.y + 0.5 / 4 }, { row: 1, col: 2 }, 4, 6),
    ).toBeCloseTo(0.5);
  });

  it("snaps inside the tolerance and releases outside it", () => {
    const piece = { row: 2, col: 3 };
    const center = pieceSlotCenter(piece, 4, 6);
    const justInside = { x: center.x + (SNAP_TOLERANCE_CELLS * 0.95) / 6, y: center.y };
    const justOutside = { x: center.x + (SNAP_TOLERANCE_CELLS * 1.1) / 6, y: center.y };
    expect(isDropNearSlot(center, piece, 4, 6)).toBe(true);
    expect(isDropNearSlot(justInside, piece, 4, 6)).toBe(true);
    expect(isDropNearSlot(justOutside, piece, 4, 6)).toBe(false);
    expect(isDropNearSlot(justOutside, piece, 4, 6, 2)).toBe(true);
  });

  it("validates normalized board coordinates", () => {
    expect(isPointOnBoard(0, 0)).toBe(true);
    expect(isPointOnBoard(1, 1)).toBe(true);
    expect(isPointOnBoard(0.5, 0.5)).toBe(true);
    expect(isPointOnBoard(-0.01, 0.5)).toBe(false);
    expect(isPointOnBoard(0.5, 1.01)).toBe(false);
    expect(isPointOnBoard(Number.NaN, 0.5)).toBe(false);
  });

  it("exposes the same viewBox margin used by the UI", () => {
    expect(pieceViewBox({ row: 0, col: 0 })).toBe(
      `${-PIECE_VIEWBOX_MARGIN} ${-PIECE_VIEWBOX_MARGIN} ${1 + PIECE_VIEWBOX_MARGIN * 2} ${
        1 + PIECE_VIEWBOX_MARGIN * 2
      }`,
    );
  });
});

describe("mulberry32", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const first = mulberry32(99);
    const second = mulberry32(99);
    for (let index = 0; index < 50; index++) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
