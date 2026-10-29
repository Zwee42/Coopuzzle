import { useMemo } from "react";
import { generatePuzzle, PIECE_VIEWBOX_MARGIN, pieceId } from "../../../shared/puzzle";
import { cn } from "../../lib/utils";
import { PuzzlePieceSvg } from "./PuzzlePieceSvg";

interface PuzzleArtworkProps {
  imageUrl: string;
  aspect: number;
  rows: number;
  cols: number;
  seed?: number;
  liftedPiece?: { row: number; col: number };
  className?: string;
}

export function PuzzleArtwork({
  imageUrl,
  aspect,
  rows,
  cols,
  seed = 71,
  liftedPiece,
  className,
}: PuzzleArtworkProps) {
  const puzzle = useMemo(() => generatePuzzle(rows, cols, seed), [rows, cols, seed]);
  const liftedId = liftedPiece ? pieceId(liftedPiece.row, liftedPiece.col) : null;
  const lifted = liftedId ? puzzle.piecesById.get(liftedId) : undefined;
  const cellAspect = aspect * (rows / cols);
  const liftedWidth = (1.6 / cols) * 100 * 1.25;
  const liftedHeight = liftedWidth / cellAspect;

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative overflow-hidden rounded-[22px] border border-white/70 bg-[#e8ddcd] shadow-[0_30px_70px_-35px_rgba(57,37,33,0.55)]"
        style={{ aspectRatio: aspect }}
      >
        {puzzle.pieces.map((piece) => {
          if (piece.id === liftedId) return null;
          return (
            <div
              key={piece.id}
              className="absolute"
              style={{
                left: `${((piece.col - PIECE_VIEWBOX_MARGIN) / cols) * 100}%`,
                top: `${((piece.row - PIECE_VIEWBOX_MARGIN) / rows) * 100}%`,
                width: `${((1 + PIECE_VIEWBOX_MARGIN * 2) / cols) * 100}%`,
                height: `${((1 + PIECE_VIEWBOX_MARGIN * 2) / rows) * 100}%`,
              }}
            >
              <PuzzlePieceSvg
                piece={piece}
                rows={rows}
                cols={cols}
                imageUrl={imageUrl}
                className="h-full w-full"
              />
            </div>
          );
        })}
        {lifted && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,transparent_40%,rgba(74,48,45,0.06))]" />
        )}
      </div>
      {lifted && (
        <div
          className="pointer-events-none absolute -bottom-5 -right-3 rotate-[8deg] drop-shadow-[0_20px_24px_rgba(54,35,31,0.32)] sm:-bottom-7 sm:-right-6"
          style={{ width: `${liftedWidth}%`, height: `${liftedHeight}%` }}
        >
          <PuzzlePieceSvg
            piece={lifted}
            rows={rows}
            cols={cols}
            imageUrl={imageUrl}
            className="h-full w-full"
          />
        </div>
      )}
    </div>
  );
}
