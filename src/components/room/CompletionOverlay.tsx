import { Heart, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import type { PlayerDto, RoomDto } from "../../../shared/protocol";
import { PuzzleMark } from "../Logo";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";

const CONFETTI_COLORS = ["#b95f54", "#6f8b75", "#c49a58", "#e8b9a8", "#8d7f9f", "#d69a7c"];

function makeConfetti(count: number) {
  let seed = 17;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: `${Math.round(random() * 100)}%`,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    delay: `${(random() * 3.4).toFixed(2)}s`,
    duration: `${(3.2 + random() * 2.4).toFixed(2)}s`,
    drift: `${Math.round((random() - 0.5) * 120)}px`,
    spin: `${Math.round(180 + random() * 540)}deg`,
    width: `${5 + Math.round(random() * 5)}px`,
    height: `${9 + Math.round(random() * 8)}px`,
  }));
}

export function CompletionOverlay({
  room,
  players,
  onRestart,
  onDismiss,
}: {
  room: RoomDto;
  players: PlayerDto[];
  onRestart: () => void;
  onDismiss: () => void;
}) {
  const confetti = useMemo(() => makeConfetti(26), []);

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center overflow-hidden rounded-[14px] bg-parchment/80 p-3 backdrop-blur-[3px] sm:p-5"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="confetti-piece"
            style={
              {
                left: piece.left,
                width: piece.width,
                height: piece.height,
                backgroundColor: piece.color,
                "--fall-delay": piece.delay,
                "--fall-duration": piece.duration,
                "--drift": piece.drift,
                "--spin": piece.spin,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="celebrate-pop relative w-full max-w-[430px] rounded-[26px] border border-white/80 bg-cream/95 p-5 text-center shadow-[0_30px_80px_-30px_rgba(53,36,37,0.55)] sm:p-7">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-blush/65 shadow-inner">
          <PuzzleMark className="h-9 w-9" />
        </div>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          All together
        </p>
        <h2 className="mt-2 font-display text-[clamp(1.7rem,4.5vw,2.35rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-cocoa text-balance">
          Every piece found its home.
        </h2>
        <p className="mx-auto mt-2.5 max-w-xs text-[0.82rem] leading-relaxed text-cocoa-soft">
          {room.totalPieces} pieces, put back together by hand. Take a moment to admire what you
          made together.
        </p>

        <div className="mt-4 flex items-center justify-center -space-x-2">
          {players.map((player) => (
            <Avatar key={player.id} player={player} size="sm" showOnline={false} />
          ))}
          <span className="ml-3 text-[0.7rem] font-medium text-cocoa-soft">
            <Heart className="mr-1 inline h-3 w-3 text-rosewood" aria-hidden="true" />
            {players.length > 1 ? "Well done, you two." : "Well done."}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onRestart} size="md" className="w-full sm:w-auto">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Start another
          </Button>
          <Button onClick={onDismiss} variant="ghost" size="md" className="w-full sm:w-auto">
            Admire it
          </Button>
        </div>
      </div>
    </div>
  );
}
