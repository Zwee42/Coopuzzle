import { SNAP_TOLERANCE_CELLS, isPieceTarget, type PieceTarget } from "./difficulty";

export interface GridSpec {
  rows: number;
  cols: number;
  targetPieces: PieceTarget;
  seed: number;
}

export interface PuzzlePiece {
  id: string;
  row: number;
  col: number;
  path: string;
}

export interface PuzzleModel extends GridSpec {
  pieces: PuzzlePiece[];
  piecesById: Map<string, PuzzlePiece>;
  trayOrder: string[];
}

interface EdgeSpec {
  sign: 1 | -1;
  center: number;
  width: number;
  depth: number;
}

type Point = [number, number];

const EDGE_SAMPLES = 24;
const TAB_MARGIN = 0.32;

/** Small, fast deterministic PRNG. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function factorPairs(total: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let cols = 2; cols < total; cols++) {
    if (total % cols !== 0) continue;
    const rows = total / cols;
    if (rows >= 2) pairs.push([cols, rows]);
  }
  return pairs;
}

/**
 * Pick the grid whose columns/rows ratio is closest to the image ratio.
 * Piece counts are always exact factorisations of a preset.
 */
export function selectGrid(targetPieces: PieceTarget, imageAspect: number): GridSpec {
  if (!isPieceTarget(targetPieces)) {
    throw new Error(`Unsupported piece target: ${String(targetPieces)}`);
  }
  const aspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 1;
  const candidates = factorPairs(targetPieces);
  if (candidates.length === 0) throw new Error(`No grid for ${targetPieces} pieces`);

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const [cols, rows] = candidate;
    const score = Math.abs(Math.log(cols / rows / aspect));
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return {
    rows: best[1],
    cols: best[0],
    targetPieces,
    seed: 0,
  };
}

export function makeSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] >>> 0;
}

function edgeSpec(random: () => number): EdgeSpec {
  return {
    sign: random() < 0.5 ? -1 : 1,
    center: 0.5 + (random() - 0.5) * 0.12,
    width: 0.3 + random() * 0.08,
    depth: 0.17 + random() * 0.06,
  };
}

function tabOffset(t: number, spec: EdgeSpec): number {
  const left = spec.center - spec.width / 2;
  const right = spec.center + spec.width / 2;
  if (t <= left || t >= right) return 0;
  const u = (t - left) / spec.width;
  return spec.sign * spec.depth * Math.pow(Math.sin(Math.PI * u), 1.35);
}

function horizontalEdge(r: number, c: number, spec: EdgeSpec): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i++) {
    const t = i / (EDGE_SAMPLES - 1);
    points.push([c + t, r + tabOffset(t, spec)]);
  }
  return points;
}

function verticalEdge(c: number, r: number, spec: EdgeSpec): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i++) {
    const t = i / (EDGE_SAMPLES - 1);
    points.push([c + tabOffset(t, spec), r + t]);
  }
  return points;
}

function straight(a: Point, b: Point): Point[] {
  return [a, b];
}

function reverse(points: Point[]): Point[] {
  return [...points].reverse();
}

function formatPoint([x, y]: Point): string {
  const rx = Math.round(x * 1000) / 1000;
  const ry = Math.round(y * 1000) / 1000;
  return `${rx} ${ry}`;
}

function pointsToPath(points: Point[]): string {
  return `M${formatPoint(points[0])}${points
    .slice(1)
    .map((point) => `L${formatPoint(point)}`)
    .join("")}Z`;
}

export function pieceId(row: number, col: number): string {
  return `r${row}c${col}`;
}

export function parsePieceId(id: string, rows: number, cols: number): { row: number; col: number } | null {
  const match = /^r(\d+)c(\d+)$/.exec(id);
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col };
}

export function generatePuzzle(rows: number, cols: number, seed: number): PuzzleModel {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2) {
    throw new Error("Puzzle needs at least 2 rows and 2 columns");
  }
  if (rows * cols > 400) throw new Error("Puzzle is too large");

  const random = mulberry32(seed >>> 0);
  const horizontal: Array<Array<Point[] | null>> = Array.from({ length: rows + 1 }, () =>
    Array<Point[] | null>(cols).fill(null),
  );
  const vertical: Array<Array<Point[] | null>> = Array.from({ length: rows }, () =>
    Array<Point[] | null>(cols + 1).fill(null),
  );

  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      horizontal[r][c] = horizontalEdge(r, c, edgeSpec(random));
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      vertical[r][c] = verticalEdge(c, r, edgeSpec(random));
    }
  }

  const pieces: PuzzlePiece[] = [];
  const piecesById = new Map<string, PuzzlePiece>();

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top =
        row === 0
          ? straight([col, row], [col + 1, row])
          : horizontal[row][col] ?? straight([col, row], [col + 1, row]);
      const right =
        col === cols - 1
          ? straight([col + 1, row], [col + 1, row + 1])
          : vertical[row][col + 1] ?? straight([col + 1, row], [col + 1, row + 1]);
      const bottom =
        row === rows - 1
          ? straight([col + 1, row + 1], [col, row + 1])
          : reverse(horizontal[row + 1][col] ?? straight([col, row + 1], [col + 1, row + 1]));
      const left =
        col === 0
          ? straight([col, row + 1], [col, row])
          : reverse(vertical[row][col] ?? straight([col, row], [col, row + 1]));

      const outline: Point[] = [
        ...top,
        ...right.slice(1),
        ...bottom.slice(1),
        ...left.slice(1, -1),
      ];
      const piece: PuzzlePiece = {
        id: pieceId(row, col),
        row,
        col,
        path: pointsToPath(outline),
      };
      pieces.push(piece);
      piecesById.set(piece.id, piece);
    }
  }

  const trayOrder = pieces.map((piece) => piece.id);
  const shuffle = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  for (let index = trayOrder.length - 1; index > 0; index--) {
    const other = Math.floor(shuffle() * (index + 1));
    [trayOrder[index], trayOrder[other]] = [trayOrder[other], trayOrder[index]];
  }

  return { rows, cols, targetPieces: (rows * cols) as PieceTarget, seed: seed >>> 0, pieces, piecesById, trayOrder };
}

export function pieceSlotCenter(piece: { row: number; col: number }, rows: number, cols: number) {
  return {
    x: (piece.col + 0.5) / cols,
    y: (piece.row + 0.5) / rows,
  };
}

export function distanceToSlotInCells(
  point: { x: number; y: number },
  piece: { row: number; col: number },
  rows: number,
  cols: number,
): number {
  const center = pieceSlotCenter(piece, rows, cols);
  const dx = (point.x - center.x) * cols;
  const dy = (point.y - center.y) * rows;
  return Math.hypot(dx, dy);
}

export function isDropNearSlot(
  point: { x: number; y: number },
  piece: { row: number; col: number },
  rows: number,
  cols: number,
  tolerance = SNAP_TOLERANCE_CELLS,
): boolean {
  return distanceToSlotInCells(point, piece, rows, cols) <= tolerance;
}

export function isPointOnBoard(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

export function pieceViewBox(piece: { row: number; col: number }): string {
  return `${piece.col - TAB_MARGIN} ${piece.row - TAB_MARGIN} ${1 + TAB_MARGIN * 2} ${
    1 + TAB_MARGIN * 2
  }`;
}

export const PIECE_VIEWBOX_MARGIN = TAB_MARGIN;
