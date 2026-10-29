import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Puzzle,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  PIECE_VIEWBOX_MARGIN,
  generatePuzzle,
  isDropNearSlot,
  type PuzzlePiece,
} from "../../shared/puzzle";
import { CompletionOverlay } from "../components/room/CompletionOverlay";
import { DeleteDialog } from "../components/room/DeleteDialog";
import { InviteDialog } from "../components/room/InviteDialog";
import { RestartDialog } from "../components/room/RestartDialog";
import { RoomHeader } from "../components/room/RoomHeader";
import { Logo, PuzzleMark } from "../components/Logo";
import { PieceTray } from "../components/puzzle/PieceTray";
import { PuzzleBoard } from "../components/puzzle/PuzzleBoard";
import { PuzzlePieceSvg } from "../components/puzzle/PuzzlePieceSvg";
import { Modal } from "../components/ui/Modal";
import { Toast, type ToastTone } from "../components/ui/Toast";
import { readSession, clearSession, readGuidePreference, saveGuidePreference, type SavedSession } from "../lib/storage";
import { cn } from "../lib/utils";
import { useRoomSocket } from "../realtime/useRoomSocket";

interface LocalDrag {
  pieceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  moved: boolean;
  wasSelected: boolean;
  boardPoint: { x: number; y: number } | null;
  width: number;
  height: number;
}

interface FlashNotice {
  seq: number;
  message: string;
  tone: ToastTone;
}

export function RoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = (rawCode ?? "").trim().toUpperCase();
  const session = useMemo(() => (code ? readSession(code) : null), [code]);

  if (!code) return <Navigate to="/" replace />;
  if (!session) return <Navigate to={`/join/${code}`} replace />;
  return <RoomGame key={`${code}:${session.token}`} code={code} session={session} />;
}

function RoomGame({ code, session }: { code: string; session: SavedSession }) {
  const navigate = useNavigate();
  const { state, actions } = useRoomSocket({ code, token: session.token });
  const { grab, release, drag, dragOff, place, cursor, dismissNotice } = actions;

  const room = state.room;
  const puzzle = useMemo(
    () => (room ? generatePuzzle(room.rows, room.cols, room.seed) : null),
    [room?.rows, room?.cols, room?.seed],
  );

  const [guideVisible, setGuideVisible] = useState(readGuidePreference);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWaiting, setSelectedWaiting] = useState(false);
  const [localDrag, setLocalDrag] = useState<LocalDrag | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [mobileWarningDismissed, setMobileWarningDismissed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  const [flash, setFlash] = useState<FlashNotice | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const lastDragSentRef = useRef(0);
  const dragOffSentRef = useRef(false);
  const pendingDropRef = useRef<{ pieceId: string; x: number; y: number } | null>(null);
  const flashSeqRef = useRef(0);
  const cursorSentRef = useRef(0);
  const handledNoticeSeqRef = useRef(0);
  const goneRef = useRef(false);
  const redirectedRef = useRef(false);

  const selectedPiece = puzzle && selectedId ? (puzzle.piecesById.get(selectedId) ?? null) : null;
  const localDragPiece =
    puzzle && localDrag ? (puzzle.piecesById.get(localDrag.pieceId) ?? null) : null;
  const isHost = state.players.find((player) => player.id === state.you)?.isHost ?? false;
  const complete = Boolean(room && room.totalPieces > 0 && room.placedCount >= room.totalPieces);
  const showCompletion = complete && !completionDismissed;
  const showMobileWarning =
    isNarrow && Boolean(room && room.totalPieces >= 200) && !mobileWarningDismissed;
  const hintSlot =
    room && localDrag && localDragPiece && localDrag.boardPoint &&
    isDropNearSlot(localDrag.boardPoint, localDragPiece, room.rows, room.cols)
      ? { row: localDragPiece.row, col: localDragPiece.col }
      : null;

  const showFlash = useCallback((message: string, tone: ToastTone = "info") => {
    flashSeqRef.current += 1;
    setFlash({ seq: flashSeqRef.current, message, tone });
  }, []);

  const leaveToHome = useCallback(
    (options: { clear?: boolean; message?: string } = {}) => {
      if (goneRef.current) return;
      goneRef.current = true;
      if (options.clear) clearSession(code);
      navigate("/", {
        replace: true,
        state: options.message ? { message: options.message } : undefined,
      });
    },
    [code, navigate],
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setSelectedWaiting(false);
    setLocalDrag(null);
    pendingDropRef.current = null;
    setCompletionDismissed(false);
    setRestartOpen(false);
  }, [room?.version]);

  useEffect(() => {
    if (!state.deleted) return;
    leaveToHome({ clear: true, message: "That room was closed by its host." });
  }, [state.deleted, leaveToHome]);

  useEffect(() => {
    if (
      state.connection !== "closed" ||
      state.room ||
      state.deleted ||
      goneRef.current ||
      redirectedRef.current
    ) {
      return;
    }
    redirectedRef.current = true;
    clearSession(code);
    navigate(`/join/${code}`, {
      replace: true,
      state: { message: "Your saved seat has ended. Add your name to join the room again." },
    });
  }, [state.connection, state.room, state.deleted, code, navigate]);

  useEffect(() => {
    if (state.connection === "open") return;
    setLocalDrag(null);
    setSelectedId(null);
    setSelectedWaiting(false);
    pendingDropRef.current = null;
  }, [state.connection]);

  useEffect(() => {
    const notice = state.notice;
    if (!notice?.pieceId || handledNoticeSeqRef.current === notice.seq) return;
    handledNoticeSeqRef.current = notice.seq;
    if (selectedId === notice.pieceId) {
      setSelectedId(null);
      setSelectedWaiting(false);
    }
    if (localDrag?.pieceId === notice.pieceId) setLocalDrag(null);
    if (pendingDropRef.current?.pieceId === notice.pieceId) pendingDropRef.current = null;
  }, [state.notice, selectedId, localDrag]);

  useEffect(() => {
    if (!room) return;
    const pending = pendingDropRef.current;
    if (pending && state.locks[pending.pieceId] === state.you) {
      pendingDropRef.current = null;
      place(pending.pieceId, pending.x, pending.y);
      setSelectedId(null);
      setSelectedWaiting(false);
    }

    if (!selectedId) return;
    if (state.placed[selectedId]) {
      setSelectedId(null);
      setSelectedWaiting(false);
      return;
    }
    if (state.locks[selectedId] === state.you) {
      if (selectedWaiting) setSelectedWaiting(false);
      return;
    }
    if (!selectedWaiting) setSelectedId(null);
  }, [room, state.locks, state.placed, state.you, selectedId, selectedWaiting, place]);

  const clearSelection = useCallback(
    (pieceId?: string) => {
      const id = pieceId ?? selectedId;
      if (id) release(id);
      setSelectedId(null);
      setSelectedWaiting(false);
    },
    [selectedId, release],
  );

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, clearSelection]);

  const boardPointFromClient = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current;
    if (!board) return null;
    const bounds = board.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    const x = (clientX - bounds.left) / bounds.width;
    const y = (clientY - bounds.top) / bounds.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, []);

  const handlePiecePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, piece: PuzzlePiece) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!puzzle || localDrag) return;
      const lockOwnerId = state.locks[piece.id];
      if (lockOwnerId && lockOwnerId !== state.you) {
        const owner = state.players.find((player) => player.id === lockOwnerId);
        showFlash(`${owner?.name ?? "Someone"} is holding that piece.`);
        return;
      }

      const wasSelected = selectedId === piece.id;
      if (selectedId && !wasSelected) clearSelection();
      setSelectedId(null);
      setSelectedWaiting(false);

      const bounds = boardRef.current?.getBoundingClientRect();
      const width = bounds
        ? (bounds.width / puzzle.cols) * (1 + PIECE_VIEWBOX_MARGIN * 2)
        : 76;
      const height = bounds
        ? (bounds.height / puzzle.rows) * (1 + PIECE_VIEWBOX_MARGIN * 2)
        : 76;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers refuse capture on synthetic events; drag still works.
      }
      lastDragSentRef.current = 0;
      dragOffSentRef.current = false;
      setLocalDrag({
        pieceId: piece.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        wasSelected,
        boardPoint: null,
        width,
        height,
      });
      if (lockOwnerId !== state.you) grab(piece.id);
    },
    [
      puzzle,
      localDrag,
      state.locks,
      state.you,
      state.players,
      selectedId,
      clearSelection,
      showFlash,
      grab,
    ],
  );

  const handlePiecePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!localDrag || event.pointerId !== localDrag.pointerId) return;
      const point = boardPointFromClient(event.clientX, event.clientY);
      const moved =
        localDrag.moved ||
        Math.hypot(event.clientX - localDrag.startX, event.clientY - localDrag.startY) > 6;
      setLocalDrag({
        ...localDrag,
        clientX: event.clientX,
        clientY: event.clientY,
        moved,
        boardPoint: point,
      });

      if (point) {
        dragOffSentRef.current = false;
        const now = performance.now();
        if (now - lastDragSentRef.current > 40) {
          drag(localDrag.pieceId, point.x, point.y);
          lastDragSentRef.current = now;
        }
      } else if (!dragOffSentRef.current) {
        dragOff(localDrag.pieceId);
        dragOffSentRef.current = true;
      }
    },
    [localDrag, boardPointFromClient, drag, dragOff],
  );

  const handlePiecePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!localDrag || event.pointerId !== localDrag.pointerId) return;
      const point = boardPointFromClient(event.clientX, event.clientY);
      const moved =
        localDrag.moved ||
        Math.hypot(event.clientX - localDrag.startX, event.clientY - localDrag.startY) > 6;
      const pieceId = localDrag.pieceId;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already have been lost.
      }
      setLocalDrag(null);

      if (!moved) {
        if (localDrag.wasSelected) {
          clearSelection(pieceId);
          return;
        }
        setSelectedId(pieceId);
        const waiting = state.locks[pieceId] !== state.you;
        setSelectedWaiting(waiting);
        if (waiting) grab(pieceId);
        return;
      }

      if (point) {
        if (state.locks[pieceId] === state.you) {
          place(pieceId, point.x, point.y);
          setSelectedId(null);
          setSelectedWaiting(false);
        } else {
          pendingDropRef.current = { pieceId, x: point.x, y: point.y };
        }
      } else {
        release(pieceId);
        setSelectedId(null);
        setSelectedWaiting(false);
      }
    },
    [
      localDrag,
      boardPointFromClient,
      clearSelection,
      state.locks,
      state.you,
      grab,
      place,
      release,
    ],
  );

  const handlePiecePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!localDrag || event.pointerId !== localDrag.pointerId) return;
      release(localDrag.pieceId);
      setLocalDrag(null);
      pendingDropRef.current = null;
    },
    [localDrag, release],
  );

  const handleKeyboardSelect = useCallback(
    (piece: PuzzlePiece) => {
      const lockOwnerId = state.locks[piece.id];
      if (lockOwnerId && lockOwnerId !== state.you) {
        const owner = state.players.find((player) => player.id === lockOwnerId);
        showFlash(`${owner?.name ?? "Someone"} is holding that piece.`);
        return;
      }
      if (selectedId === piece.id) {
        clearSelection(piece.id);
        return;
      }
      if (selectedId) clearSelection();
      setSelectedId(piece.id);
      const waiting = state.locks[piece.id] !== state.you;
      setSelectedWaiting(waiting);
      if (waiting) grab(piece.id);
      window.requestAnimationFrame(() => boardRef.current?.focus());
    },
    [
      state.locks,
      state.you,
      state.players,
      selectedId,
      clearSelection,
      showFlash,
      grab,
    ],
  );

  const handleBoardPlace = useCallback(
    (point: { x: number; y: number }) => {
      if (!selectedPiece) return;
      const pieceId = selectedPiece.id;
      if (state.locks[pieceId] === state.you) {
        place(pieceId, point.x, point.y);
        setSelectedId(null);
        setSelectedWaiting(false);
      } else {
        pendingDropRef.current = { pieceId, x: point.x, y: point.y };
      }
    },
    [selectedPiece, state.locks, state.you, place],
  );

  const handleCursorMove = useCallback(
    (point: { x: number; y: number }) => {
      const now = performance.now();
      if (now - cursorSentRef.current < 90) return;
      cursorSentRef.current = now;
      cursor(point.x, point.y);
    },
    [cursor],
  );

  const toggleGuide = useCallback(() => {
    const next = !guideVisible;
    setGuideVisible(next);
    saveGuidePreference(next);
  }, [guideVisible]);

  const dismissGameNotice = useCallback(() => {
    if (state.notice) dismissNotice(state.notice.seq);
  }, [state.notice, dismissNotice]);

  const dismissFlash = useCallback(() => setFlash(null), []);

  if (!room || !puzzle) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 px-5 pb-4 pt-[calc(1.1rem+var(--safe-top))] sm:px-8">
          <Logo />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-cocoa-soft transition hover:bg-cocoa/[0.05] hover:text-cocoa"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Leave
          </Link>
        </header>
        <main className="grid flex-1 place-items-center px-5 pb-20">
          <div className="text-center">
            <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-[20px] border border-white/70 bg-white/45 shadow-sm">
              <PuzzleMark className="h-10 w-10" />
              {state.connection !== "closed" && (
                <Loader2
                  className="absolute -bottom-1 -right-1 h-5 w-5 animate-spin rounded-full bg-parchment text-rosewood"
                  aria-hidden="true"
                />
              )}
            </span>
            <p className="mt-5 font-display text-2xl font-semibold text-cocoa">
              Setting the table…
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-cocoa-soft">
              {state.connection === "reconnecting"
                ? "Trying to reconnect to the shared puzzle."
                : state.connection === "closed"
                  ? "That room is no longer available."
                  : "Finding your saved seat and the pieces."}
            </p>
            <Link
              to="/"
              className="mt-5 inline-block text-xs text-cocoa-soft underline-offset-4 transition hover:text-cocoa hover:underline"
            >
              Back home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <RoomHeader
        room={room}
        players={state.players}
        you={state.you}
        connection={state.connection}
        isHost={isHost}
        onInvite={() => setInviteOpen(true)}
        onRestart={() => setRestartOpen(true)}
        onLeave={() => leaveToHome()}
        onDelete={() => setDeleteOpen(true)}
      />

      {showMobileWarning && (
        <div className="mx-auto w-full max-w-[1600px] shrink-0 px-3 pt-2 sm:px-5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-gold/25 bg-[#fbf3e2]/85 px-3.5 py-2.5 text-[0.72rem] leading-relaxed text-[#7a5a28]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p className="flex-1">
              <span className="font-semibold">{room.totalPieces} pieces on a phone</span> is a real
              labor of love. Rotate to landscape for more room, or start a smaller puzzle from the
              New puzzle button.
            </p>
            <button
              type="button"
              onClick={() => setMobileWarningDismissed(true)}
              className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full transition hover:bg-black/5"
              aria-label="Dismiss warning"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main
        className={cn(
          "mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col gap-3 px-3 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 sm:px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:px-5 xl:grid-cols-[minmax(0,1fr)_380px]",
        )}
      >
        <section className="flex min-h-0 flex-1 flex-col">
          <PuzzleBoard
            puzzle={puzzle}
            room={room}
            placed={state.placed}
            players={state.players}
            you={state.you}
            cursors={state.cursors}
            drags={state.drags}
            guideVisible={guideVisible}
            selectedPiece={selectedPiece}
            hintSlot={hintSlot}
            boardRef={boardRef}
            onPlaceSelected={handleBoardPlace}
            onCursorMove={handleCursorMove}
            overlay={
              showCompletion ? (
                <CompletionOverlay
                  room={room}
                  players={state.players}
                  onRestart={() => {
                    setCompletionDismissed(true);
                    setRestartOpen(true);
                  }}
                  onDismiss={() => setCompletionDismissed(true)}
                />
              ) : undefined
            }
          />
        </section>

        <div className="h-[176px] shrink-0 sm:h-[196px] lg:h-auto lg:min-h-0">
          <PieceTray
            puzzle={puzzle}
            room={room}
            placed={state.placed}
            locks={state.locks}
            drags={state.drags}
            you={state.you}
            players={state.players}
            selectedPieceId={selectedId}
            draggingPieceId={localDrag?.pieceId ?? null}
            guideVisible={guideVisible}
            onToggleGuide={toggleGuide}
            onOpenPreview={() => setPreviewOpen(true)}
            onPiecePointerDown={handlePiecePointerDown}
            onPiecePointerMove={handlePiecePointerMove}
            onPiecePointerUp={handlePiecePointerUp}
            onPiecePointerCancel={handlePiecePointerCancel}
            onKeyboardSelect={handleKeyboardSelect}
          />
        </div>
      </main>

      {localDrag && localDragPiece && (
        <div
          className="pointer-events-none fixed z-[70] drop-shadow-[0_18px_20px_rgba(45,31,29,0.38)]"
          style={{
            left: localDrag.clientX - localDrag.width / 2,
            top: localDrag.clientY - localDrag.height / 2,
            width: localDrag.width,
            height: localDrag.height,
            transform: "rotate(-2deg) scale(1.03)",
          }}
          aria-hidden="true"
        >
          <PuzzlePieceSvg
            piece={localDragPiece}
            rows={puzzle.rows}
            cols={puzzle.cols}
            imageUrl={room.image.url}
            className="h-full w-full"
          />
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--safe-bottom))] z-[80] flex flex-col items-center gap-2 px-3">
        <Toast notice={state.notice} onDismiss={dismissGameNotice} />
        <Toast notice={flash} onDismiss={dismissFlash} />
      </div>

      <InviteDialog
        open={inviteOpen}
        room={room}
        players={state.players}
        you={state.you}
        onClose={() => setInviteOpen(false)}
      />

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={room.image.title ?? "Your picture"}
        description="The whole picture, for when you need a closer look."
      >
        <div className="overflow-hidden rounded-[22px] border border-white/70 bg-parchment-deep shadow-inner">
          <img
            src={room.image.url}
            alt={room.image.title ?? "The puzzle picture"}
            className="w-full object-contain"
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-[0.7rem] text-cocoa-soft">
          <span className="inline-flex items-center gap-1.5">
            <Puzzle className="h-3.5 w-3.5 text-rosewood" aria-hidden="true" />
            {room.totalPieces} pieces · {room.rows} rows × {room.cols} columns
          </span>
          <span>{room.placedCount} placed</span>
        </div>
      </Modal>

      {restartOpen && (
        <RestartDialog
          room={room}
          token={session.token}
          onClose={() => setRestartOpen(false)}
          onStarted={() => {
            setRestartOpen(false);
            showFlash("A fresh puzzle is on the table.", "success");
          }}
        />
      )}

      {deleteOpen && (
        <DeleteDialog
          room={room}
          token={session.token}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() =>
            leaveToHome({ clear: true, message: "Your room has been put away." })
          }
        />
      )}
    </div>
  );
}
