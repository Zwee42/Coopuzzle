import { Eye, EyeOff, Maximize2, Sparkles } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { DragState, PlayerDto, RoomDto } from "../../../shared/protocol";
import { type PuzzleModel, type PuzzlePiece } from "../../../shared/puzzle";
import { cn, pluralize } from "../../lib/utils";
import { PuzzlePieceSvg } from "./PuzzlePieceSvg";
import { Avatar } from "../ui/Avatar";

interface PieceTrayProps {
  puzzle: PuzzleModel;
  room: RoomDto;
  placed: Record<string, true>;
  locks: Record<string, string>;
  drags: Record<string, DragState>;
  you: string | null;
  players: PlayerDto[];
  selectedPieceId: string | null;
  draggingPieceId: string | null;
  guideVisible: boolean;
  onToggleGuide: () => void;
  onOpenPreview: () => void;
  onPiecePointerDown: (event: ReactPointerEvent<HTMLButtonElement>, piece: PuzzlePiece) => void;
  onPiecePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPiecePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPiecePointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardSelect: (piece: PuzzlePiece) => void;
}

function fittedSize(base: number, aspect: number) {
  return aspect >= 1
    ? { width: base, height: base / aspect }
    : { width: base * aspect, height: base };
}

export function PieceTray({
  puzzle,
  room,
  placed,
  locks,
  drags,
  you,
  players,
  selectedPieceId,
  draggingPieceId,
  guideVisible,
  onToggleGuide,
  onOpenPreview,
  onPiecePointerDown,
  onPiecePointerMove,
  onPiecePointerUp,
  onPiecePointerCancel,
  onKeyboardSelect,
}: PieceTrayProps) {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const loosePieces = puzzle.trayOrder
    .filter((pieceId) => !placed[pieceId])
    .map((pieceId) => puzzle.piecesById.get(pieceId))
    .filter((piece): piece is PuzzlePiece => Boolean(piece));
  const visiblePieces = loosePieces.filter((piece) => {
    const drag = drags[piece.id];
    // Keep our own dragged piece mounted so pointer capture survives the server echo.
    return !drag || drag.playerId === you;
  });
  const percent = room.totalPieces > 0 ? Math.round((room.placedCount / room.totalPieces) * 100) : 0;
  const cellAspect = (room.image.width / room.image.height) * (puzzle.rows / puzzle.cols);
  const tileSize = fittedSize(58, cellAspect);

  return (
    <section
      aria-label="Pieces and progress"
      className="flex h-full min-h-0 flex-col rounded-[26px] border border-white/70 bg-[#fbf6ed]/88 p-3 shadow-[0_18px_50px_-35px_rgba(57,37,33,0.55)] backdrop-blur-sm lg:p-4"
    >
      <div className="mb-3 flex items-start gap-3">
        <button
          type="button"
          onClick={onOpenPreview}
          className="group relative hidden h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-white/80 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-rosewood sm:block"
          aria-label="Open the full reference picture"
          title="Open the full picture"
        >
          <img
            src={room.image.url}
            alt={room.image.title ?? "Puzzle reference"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
          <span className="absolute inset-0 grid place-items-center bg-cocoa/0 text-white opacity-0 transition group-hover:bg-cocoa/25 group-hover:opacity-100">
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
              {room.image.title ?? "Your photo"}
            </p>
            <span className="shrink-0 text-[0.68rem] tabular-nums text-cocoa-soft">
              {room.placedCount}/{room.totalPieces}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cocoa/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={room.totalPieces}
            aria-valuenow={room.placedCount}
            aria-label={`${room.placedCount} of ${room.totalPieces} pieces placed`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-rosewood to-[#d69a7c] transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[0.72rem] text-cocoa-soft">
              {loosePieces.length === 0
                ? "Every piece is home."
                : `${loosePieces.length} ${pluralize(loosePieces.length, "piece")} left`}
            </p>
            <button
              type="button"
              onClick={onToggleGuide}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-medium text-cocoa-soft outline-none transition hover:bg-cocoa/[0.05] hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood"
              aria-pressed={guideVisible}
              title={guideVisible ? "Hide the picture guide" : "Show the picture guide"}
            >
              {guideVisible ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Guide
            </button>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {visiblePieces.length > 0 ? (
          <div
            className="tray-scroll flex h-full gap-2 overflow-x-auto overflow-y-hidden pb-1 lg:grid lg:grid-cols-3 lg:content-start lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1"
            style={{ touchAction: "pan-x" }}
          >
            {visiblePieces.map((piece) => {
              const lockOwnerId = locks[piece.id];
              const lockOwner = lockOwnerId ? playerMap.get(lockOwnerId) : undefined;
              const lockedByOther = Boolean(lockOwner && lockOwner.id !== you);
              const selected = selectedPieceId === piece.id;
              return (
                <button
                  key={piece.id}
                  type="button"
                  data-piece-id={piece.id}
                  data-testid={`tray-piece-${piece.id}`}
                  aria-label={`Puzzle piece ${piece.row + 1}, ${piece.col + 1}${lockedByOther ? `, held by ${lockOwner?.name}` : ""}`}
                  aria-pressed={selected}
                  aria-disabled={lockedByOther}
                  title={lockedByOther ? `${lockOwner?.name} is holding this piece` : "Drag to the board, or select then tap the board"}
                  onPointerDown={(event) => onPiecePointerDown(event, piece)}
                  onPointerMove={onPiecePointerMove}
                  onPointerUp={onPiecePointerUp}
                  onPointerCancel={onPiecePointerCancel}
                  onClick={(event) => {
                    if (event.detail === 0) onKeyboardSelect(piece);
                  }}
                  className={cn(
                    "group relative grid h-[78px] w-[78px] shrink-0 place-items-center rounded-2xl border bg-white/35 p-1.5 outline-none transition duration-200 lg:h-[84px] lg:w-full",
                    "focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-1 focus-visible:ring-offset-[#fbf6ed]",
                    selected
                      ? "border-rosewood/60 bg-blush/70 shadow-[0_0_0_3px_rgba(185,95,84,0.1)]"
                      : "border-cocoa/[0.07] hover:-translate-y-0.5 hover:border-cocoa/15 hover:bg-white/60 hover:shadow-sm",
                    lockedByOther && "cursor-not-allowed opacity-60",
                    draggingPieceId === piece.id && "invisible",
                  )}
                  style={{ touchAction: "none" }}
                >
                  <div style={tileSize} className="drop-shadow-[0_3px_2px_rgba(63,44,37,0.16)]">
                    <PuzzlePieceSvg
                      piece={piece}
                      rows={puzzle.rows}
                      cols={puzzle.cols}
                      imageUrl={room.image.url}
                      className="h-full w-full"
                    />
                  </div>
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rosewood text-white shadow-sm">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                  )}
                  {lockOwner && (
                    <span className="absolute bottom-1.5 right-1.5">
                      <Avatar player={lockOwner} size="xs" showOnline={false} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[90px] flex-col items-center justify-center rounded-2xl border border-dashed border-cocoa/15 px-5 text-center">
            <span className="font-display text-lg text-cocoa">All together now.</span>
            <span className="mt-1 text-xs text-cocoa-soft">Every piece has found its place.</span>
          </div>
        )}
      </div>

      <p className="mt-2 hidden text-center text-[0.66rem] leading-snug text-cocoa-soft/80 sm:block lg:mt-3">
        Drag a piece, or tap one and then tap the board.
      </p>
    </section>
  );
}
