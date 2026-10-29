import { DIFFICULTIES, type PieceTarget } from "../../../shared/difficulty";
import { cn } from "../../lib/utils";

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: PieceTarget;
  onChange: (value: PieceTarget) => void;
}) {
  return (
    <fieldset>
      <div className="flex items-end justify-between gap-3">
        <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
          How many pieces
        </legend>
        <span className="text-[0.68rem] text-cocoa-soft/75">Exactly, not approximately</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DIFFICULTIES.map((difficulty) => {
          const selected = value === difficulty.pieces;
          return (
            <button
              key={difficulty.pieces}
              type="button"
              onClick={() => onChange(difficulty.pieces)}
              aria-pressed={selected}
              className={cn(
                "relative rounded-2xl border px-3 py-2.5 text-left outline-none transition duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-rosewood",
                selected
                  ? "border-rosewood/55 bg-blush/65 shadow-[0_0_0_3px_rgba(185,95,84,0.09)]"
                  : "border-cocoa/10 bg-white/40 hover:border-cocoa/20 hover:bg-white/70",
              )}
            >
              <span className="block font-display text-[1.35rem] font-semibold leading-none tabular-nums text-cocoa">
                {difficulty.pieces}
              </span>
              <span className="mt-1 block text-[0.72rem] font-medium text-cocoa">
                {difficulty.name}
              </span>
              <span className="mt-0.5 hidden text-[0.62rem] leading-snug text-cocoa-soft/80 sm:block">
                {difficulty.note}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
