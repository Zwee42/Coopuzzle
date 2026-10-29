import { useId } from "react";
import type { PuzzlePiece } from "../../../shared/puzzle";
import { pieceViewBox } from "../../../shared/puzzle";
import { cn } from "../../lib/utils";

export function PuzzlePieceSvg({
  piece,
  rows,
  cols,
  imageUrl,
  className,
  outlined = true,
}: {
  piece: PuzzlePiece;
  rows: number;
  cols: number;
  imageUrl: string;
  className?: string;
  outlined?: boolean;
}) {
  const rawId = useId();
  const clipId = `clip-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}-${piece.row}-${piece.col}`;

  return (
    <svg
      viewBox={pieceViewBox(piece)}
      preserveAspectRatio="none"
      className={cn("block", className)}
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={piece.path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={cols}
          height={rows}
          preserveAspectRatio="none"
        />
      </g>
      {outlined && (
        <path
          d={piece.path}
          fill="none"
          stroke="rgba(255,255,255,0.36)"
          strokeWidth={0.014}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
