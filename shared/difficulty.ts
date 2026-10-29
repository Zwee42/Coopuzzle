export const DIFFICULTIES = [
  { pieces: 12, name: "Gentle", note: "A quick little moment" },
  { pieces: 24, name: "Easy", note: "A cozy warm-up" },
  { pieces: 48, name: "Soft", note: "A lovely evening" },
  { pieces: 80, name: "Medium", note: "Settle in together" },
  { pieces: 120, name: "Ambitious", note: "A proper little project" },
  { pieces: 200, name: "Intricate", note: "For patient hands" },
  { pieces: 300, name: "Devoted", note: "An all-evening affair" },
] as const;

export type PieceTarget = (typeof DIFFICULTIES)[number]["pieces"];

export const PIECE_TARGETS = DIFFICULTIES.map((difficulty) => difficulty.pieces);

export const ROOM_CAPACITY = 4;

export const SNAP_TOLERANCE_CELLS = 0.9;

export function isPieceTarget(value: unknown): value is PieceTarget {
  return typeof value === "number" && PIECE_TARGETS.includes(value as PieceTarget);
}

export function difficultyFor(pieces: number) {
  return DIFFICULTIES.find((entry) => entry.pieces === pieces) ?? DIFFICULTIES[3];
}

export const PLAYER_COLORS = [
  { id: "coral", value: "#b95f54", soft: "#f4ded9" },
  { id: "sage", value: "#63816d", soft: "#e0e9e1" },
  { id: "ochre", value: "#a77b32", soft: "#f4e8cf" },
  { id: "blue", value: "#57758a", soft: "#dfe8ee" },
] as const;

export type PlayerColor = (typeof PLAYER_COLORS)[number];
