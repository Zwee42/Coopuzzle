import type { MouseEvent, PointerEvent, ReactNode, RefObject } from "react";
import type { PlayerDto, RoomDto } from "../../../shared/protocol";
import type { DragState } from "../../../shared/protocol";
import {
  PIECE_VIEWBOX_MARGIN,
  pieceSlotCenter,
  type PuzzleModel,
  type PuzzlePiece,
} from "../../../shared/puzzle";
import type { GameState } from "../../state/gameReducer";
import { cn } from "../../lib/utils";
import { PuzzlePieceSvg } from "./PuzzlePieceSvg";
import { useFitBox } from "./useFitBox";

interface PuzzleBoardProps {
  puzzle: PuzzleModel;
  room: RoomDto;
  placed: GameState["placed"];
  players: PlayerDto[];
  you: string | null;
  cursors: GameState["cursors"];
  drags: Record<string, DragState>;
  guideVisible: boolean;
  selectedPiece: PuzzlePiece | null;
  hintSlot?: { row: number; col: number } | null;
  boardRef?: RefObject<HTMLDivElement | null>;
  overlay?: ReactNode;
  onPlaceSelected?: (point: { x: number; y: number }) => void;
  onCursorMove?: (point: { x: number; y: number }) => void;
}

function piecePositionStyle(piece: PuzzlePiece, rows: number, cols: number) {
  const margin = PIECE_VIEWBOX_MARGIN;
  return {
    left: `${((piece.col - margin) / cols) * 100}%`,
    top: `${((piece.row - margin) / rows) * 100}%`,
    width: `${((1 + margin * 2) / cols) * 100}%`,
    height: `${((1 + margin * 2) / rows) * 100}%`,
  };
}

function ghostPositionStyle(x: number, y: number, rows: number, cols: number) {
  const margin = PIECE_VIEWBOX_MARGIN;
  return {
    left: `${(x - (0.5 + margin) / cols) * 100}%`,
    top: `${(y - (0.5 + margin) / rows) * 100}%`,
    width: `${((1 + margin * 2) / cols) * 100}%`,
    height: `${((1 + margin * 2) / rows) * 100}%`,
  };
}

export function PuzzleBoard({
  puzzle,
  room,
  placed,
  players,
  you,
  cursors,
  drags,
  guideVisible,
  selectedPiece,
  hintSlot,
  boardRef,
  overlay,
  onPlaceSelected,
  onCursorMove,
}: PuzzleBoardProps) {
  const aspect = room.image.width / room.image.height;
  const { ref, size } = useFitBox(aspect);
  const playerMap = new Map(players.map((player) => [player.id, player]));

  function boardPoint(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  const visible = size.width > 0;

  return (
    <div ref={ref} className="grid min-h-0 w-full flex-1 place-items-center">
      <div
        ref={(element) => {
          if (boardRef) boardRef.current = element;
        }}
        data-testid="puzzle-board"
        data-room-code={room.code}
        data-rows={puzzle.rows}
        data-cols={puzzle.cols}
        className={cn(
          "relative select-none overflow-hidden rounded-[14px] border border-white/70 bg-[#e8ddcd] shadow-[0_26px_65px_-32px_rgba(57,37,33,0.55),inset_0_0_0_1px_rgba(84,59,50,0.06)] transition-opacity duration-200",
          "outline-none focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-2 focus-visible:ring-offset-parchment",
          selectedPiece && "cursor-crosshair",
          !visible && "opacity-0",
        )}
        style={{
          width: visible ? size.width : undefined,
          height: visible ? size.height : undefined,
          aspectRatio: visible ? undefined : aspect,
        }}
        role="group"
        tabIndex={selectedPiece ? 0 : -1}
        aria-label={
          selectedPiece
            ? `Puzzle board, ${room.placedCount} of ${room.totalPieces} pieces placed. Press Enter to place the selected piece.`
            : `Puzzle board, ${room.placedCount} of ${room.totalPieces} pieces placed`
        }
        onKeyDown={(event) => {
          if (!selectedPiece || !onPlaceSelected) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPlaceSelected(pieceSlotCenter(selectedPiece, puzzle.rows, puzzle.cols));
          }
        }}
        onClick={(event) => {
          if (!selectedPiece || !onPlaceSelected) return;
          const point = boardPoint(event);
          if (point) onPlaceSelected(point);
        }}
        onPointerMove={(event) => {
          if (!onCursorMove) return;
          const point = boardPoint(event);
          if (point) onCursorMove(point);
        }}
      >
        <img
          src={room.image.url}
          alt=""
          draggable={false}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
            guideVisible ? "opacity-[0.14]" : "opacity-0",
          )}
          style={{ filter: "saturate(.72) sepia(.08)" }}
        />

        {room.placedCount === 0 && !selectedPiece && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[9%] flex justify-center">
            <span className="rounded-full border border-cocoa/10 bg-parchment/80 px-3 py-1 text-[0.68rem] font-medium tracking-wide text-cocoa-soft shadow-sm backdrop-blur-sm">
              Pick a piece from the tray
            </span>
          </div>
        )}

        {hintSlot && (
          <div
            className="pointer-events-none absolute z-10 rounded-[8px] border-2 border-dashed border-rosewood/65 bg-rosewood/[0.07] shadow-[inset_0_0_18px_rgba(185,95,84,0.14)]"
            style={{
              left: `${(hintSlot.col / puzzle.cols) * 100}%`,
              top: `${(hintSlot.row / puzzle.rows) * 100}%`,
              width: `${(1 / puzzle.cols) * 100}%`,
              height: `${(1 / puzzle.rows) * 100}%`,
            }}
            aria-hidden="true"
          />
        )}

        {Object.keys(placed).map((pieceId) => {
          const piece = puzzle.piecesById.get(pieceId);
          if (!piece) return null;
          return (
            <div
              key={pieceId}
              className="piece-arrive pointer-events-none absolute"
              style={piecePositionStyle(piece, puzzle.rows, puzzle.cols)}
            >
              <PuzzlePieceSvg
                piece={piece}
                rows={puzzle.rows}
                cols={puzzle.cols}
                imageUrl={room.image.url}
                className="h-full w-full"
              />
            </div>
          );
        })}

        {Object.entries(drags).map(([pieceId, drag]) => {
          if (drag.playerId === you) return null;
          const piece = puzzle.piecesById.get(pieceId);
          const player = playerMap.get(drag.playerId);
          if (!piece || !player) return null;
          return (
            <div
              key={`drag-${pieceId}`}
              data-testid="remote-drag"
              data-player-id={drag.playerId}
              className="pointer-events-none absolute z-20 opacity-95"
              style={ghostPositionStyle(drag.x, drag.y, puzzle.rows, puzzle.cols)}
            >
              <PuzzlePieceSvg
                piece={piece}
                rows={puzzle.rows}
                cols={puzzle.cols}
                imageUrl={room.image.url}
                className="h-full w-full drop-shadow-[0_10px_12px_rgba(45,31,29,0.35)]"
              />
              <span
                className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.58rem] font-semibold text-white shadow-sm"
                style={{ backgroundColor: player.color }}
              >
                {player.name}
              </span>
            </div>
          );
        })}

        {Object.entries(cursors).map(([playerId, cursor]) => {
          if (playerId === you) return null;
          const player = playerMap.get(playerId);
          if (!player) return null;
          return (
            <div
              key={`cursor-${playerId}`}
              data-testid="remote-cursor"
              data-player-id={playerId}
              className="pointer-events-none absolute z-30 -translate-x-1 -translate-y-1 transition-[left,top] duration-100 ease-linear"
              style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
            >
              <span
                className="block h-3 w-3 rounded-full border-2 border-white shadow-[0_2px_7px_rgba(30,20,20,0.35)]"
                style={{ backgroundColor: player.color }}
              />
              <span
                className="absolute left-3 top-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.58rem] font-semibold text-white shadow-sm"
                style={{ backgroundColor: player.color }}
              >
                {player.name}
              </span>
            </div>
          );
        })}

        {overlay}
      </div>
    </div>
  );
}
