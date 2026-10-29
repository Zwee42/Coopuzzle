import { useMemo } from "react";
import { selectGrid } from "../../../shared/puzzle";
import type { PieceTarget } from "../../../shared/difficulty";
import { PuzzleArtwork } from "../puzzle/PuzzleArtwork";

export function PuzzleSetupPreview({
  imageUrl,
  aspect,
  pieces,
  className,
}: {
  imageUrl: string;
  aspect: number;
  pieces: PieceTarget;
  className?: string;
}) {
  const grid = useMemo(() => selectGrid(pieces, aspect), [pieces, aspect]);

  return (
    <div className={className}>
      <PuzzleArtwork
        imageUrl={imageUrl}
        aspect={aspect}
        rows={grid.rows}
        cols={grid.cols}
        seed={47}
        liftedPiece={{ row: Math.min(1, grid.rows - 1), col: Math.min(2, grid.cols - 1) }}
      />
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/35 px-4 py-3 backdrop-blur-sm">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.15em] text-cocoa-soft">
            Your puzzle
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-cocoa">
            {pieces} pieces, exactly
          </p>
        </div>
        <p className="text-right text-[0.68rem] leading-relaxed text-cocoa-soft/80">
          {grid.cols} columns
          <br />
          {grid.rows} rows
        </p>
      </div>
    </div>
  );
}
