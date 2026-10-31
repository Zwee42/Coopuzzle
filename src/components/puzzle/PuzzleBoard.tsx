import {
  Image as ImageIcon,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button, a, input, select, textarea, [role='button'], [role='menuitem'], [contenteditable='true']",
      ),
    )
  );
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
  const { ref: fitRef, size } = useFitBox(aspect);
  const playerMap = new Map(players.map((player) => [player.id, player]));

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [referenceVisible, setReferenceVisible] = useState(false);
  const boardElement = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panGesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const pinchGesture = useRef<{ distance: number; zoom: number } | null>(null);

  function clampPan(next: { x: number; y: number }, nextZoom = zoom) {
    const wrapper = fitRef.current;
    if (!wrapper) return next;
    const bounds = wrapper.getBoundingClientRect();
    const maxX = Math.max(0, (size.width * nextZoom - bounds.width) / 2);
    const maxY = Math.max(0, (size.height * nextZoom - bounds.height) / 2);
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }

  function setZoomLevel(nextZoom: number) {
    const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(clamped);
    setPan((current) => (clamped === 1 ? { x: 0, y: 0 } : clampPan(current, clamped)));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const wheelState = useRef({ zoom, clampPan });
  wheelState.current = { zoom, clampPan };

  useEffect(() => {
    const element = boardElement.current;
    if (!element) return;
    // React attaches wheel listeners passively, so preventDefault there is
    // ignored. Use a native non-passive listener to keep the page still.
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const current = wheelState.current;
      const next = clamp(
        current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      setZoom(next);
      setPan((value) => (next === 1 ? { x: 0, y: 0 } : current.clampPan(value, next)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    resetView();
    setReferenceVisible(false);
    pointers.current.clear();
    panGesture.current = null;
    pinchGesture.current = null;
  }, [room.version, puzzle.rows, puzzle.cols]);

  function boardPoint(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function pointerDistance() {
    const values = [...pointers.current.values()];
    if (values.length < 2) return null;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  const visible = size.width > 0;

  return (
    <div
      ref={fitRef}
      className={cn(
        "relative grid min-h-0 w-full flex-1 place-items-center",
        zoom > 1 && "overflow-hidden",
      )}
    >
      <div
        ref={(element) => {
          boardElement.current = element;
          if (boardRef) boardRef.current = element;
        }}
        data-testid="puzzle-board"
        data-room-code={room.code}
        data-rows={puzzle.rows}
        data-cols={puzzle.cols}
        className={cn(
          "relative select-none touch-none overflow-hidden rounded-[14px] border border-white/70 bg-[#e8ddcd] shadow-[0_26px_65px_-32px_rgba(57,37,33,0.55),inset_0_0_0_1px_rgba(84,59,50,0.06)] transition-opacity duration-200",
          "outline-none focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-2 focus-visible:ring-offset-parchment",
          selectedPiece && "cursor-crosshair",
          !visible && "opacity-0",
        )}
        style={{
          width: visible ? size.width : undefined,
          height: visible ? size.height : undefined,
          aspectRatio: visible ? undefined : aspect,
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "center",
          willChange: zoom > 1 ? "transform" : undefined,
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
          if (isInteractiveTarget(event.target)) return;
          if (!selectedPiece || !onPlaceSelected) return;
          const point = boardPoint(event);
          if (point) onPlaceSelected(point);
        }}
        onDoubleClick={(event) => {
          if (isInteractiveTarget(event.target)) return;
          resetView();
        }}
        onPointerDown={(event) => {
          if (isInteractiveTarget(event.target)) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic events and some browsers refuse capture.
          }
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const distance = pointerDistance();
          if (distance !== null) {
            pinchGesture.current = { distance, zoom };
            panGesture.current = null;
          } else if (!selectedPiece && zoom > 1) {
            panGesture.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }
        }}
        onPointerMove={(event) => {
          const point = boardPoint(event);
          if (point && onCursorMove) onCursorMove(point);

          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (pinchGesture.current && pointers.current.size >= 2) {
            const distance = pointerDistance();
            if (distance && pinchGesture.current.distance > 0) {
              const next = clamp(
                pinchGesture.current.zoom * (distance / pinchGesture.current.distance),
                MIN_ZOOM,
                MAX_ZOOM,
              );
              setZoom(next);
              setPan((current) => clampPan(current, next));
            }
            return;
          }

          const gesture = panGesture.current;
          if (gesture?.pointerId === event.pointerId) {
            setPan(
              clampPan({
                x: gesture.panX + event.clientX - gesture.startX,
                y: gesture.panY + event.clientY - gesture.startY,
              }),
            );
          }
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinchGesture.current = null;
          if (panGesture.current?.pointerId === event.pointerId) panGesture.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Capture may already be gone.
          }
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinchGesture.current = null;
          if (panGesture.current?.pointerId === event.pointerId) panGesture.current = null;
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

      <div
        className="absolute right-2 top-2 z-40 flex items-center gap-0.5 rounded-full border border-white/75 bg-parchment/92 p-1 shadow-[0_8px_24px_-12px_rgba(57,37,33,0.45)] backdrop-blur-sm"
        role="group"
        aria-label="Board view controls"
      >
        <button
          type="button"
          onClick={() => setZoomLevel(zoom / 1.25)}
          disabled={zoom <= MIN_ZOOM}
          className="grid h-7 w-7 place-items-center rounded-full text-cocoa-soft outline-none transition hover:bg-cocoa/[0.06] hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood disabled:opacity-35"
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="min-w-9 text-center text-[0.62rem] font-semibold tabular-nums text-cocoa-soft">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoomLevel(zoom * 1.25)}
          disabled={zoom >= MAX_ZOOM}
          className="grid h-7 w-7 place-items-center rounded-full text-cocoa-soft outline-none transition hover:bg-cocoa/[0.06] hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood disabled:opacity-35"
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetView}
          disabled={zoom === MIN_ZOOM && pan.x === 0 && pan.y === 0}
          className="grid h-7 w-7 place-items-center rounded-full text-cocoa-soft outline-none transition hover:bg-cocoa/[0.06] hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood disabled:opacity-35"
          aria-label="Reset board view"
          title="Reset board view"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-cocoa/10" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setReferenceVisible((current) => !current)}
          aria-pressed={referenceVisible}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full outline-none transition hover:bg-cocoa/[0.06] focus-visible:ring-2 focus-visible:ring-rosewood",
            referenceVisible ? "bg-blush/70 text-rosewood" : "text-cocoa-soft hover:text-cocoa",
          )}
          aria-label={referenceVisible ? "Hide reference picture" : "Show reference picture"}
          title={referenceVisible ? "Hide reference picture" : "Show reference picture"}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {referenceVisible && (
        <div
          data-testid="reference-image"
          className="pointer-events-none absolute bottom-2 left-2 z-40 w-28 overflow-hidden rounded-xl border border-white/80 bg-parchment/90 p-1 shadow-[0_12px_30px_-15px_rgba(57,37,33,0.55)] sm:w-36"
        >
          <img
            src={room.image.url}
            alt={room.image.title ?? "Puzzle reference"}
            className="h-auto w-full rounded-lg object-cover"
          />
          <p className="px-1 pb-0.5 pt-1 text-center text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-cocoa-soft">
            Reference
          </p>
        </div>
      )}
    </div>
  );
}
