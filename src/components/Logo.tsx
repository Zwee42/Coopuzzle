import { Link } from "react-router-dom";
import { cn } from "../lib/utils";

export function PuzzleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn("h-9 w-9", className)}
      fill="none"
    >
      <rect x="3" y="3" width="42" height="42" rx="13" fill="#f7f0e5" />
      <path
        d="M10.5 15.5a4 4 0 0 1 4-4h8v4a3.8 3.8 0 1 0 7.6 0v-4h3.4a4 4 0 0 1 4 4v7.9h-4a3.8 3.8 0 1 0 0 7.6h4v2.5a4 4 0 0 1-4 4h-8v-4a3.8 3.8 0 1 0-7.6 0v4h-3.4a4 4 0 0 1-4-4v-8h4a3.8 3.8 0 1 0 0-7.6h-4Z"
        fill="#b95f54"
      />
      <circle cx="24" cy="24" r="2.6" fill="#f7f0e5" opacity=".8" />
    </svg>
  );
}

export function Logo({
  to = "/",
  compact = false,
  className,
}: {
  to?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label="Puzzle Together home"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-4 focus-visible:ring-offset-parchment",
        className,
      )}
    >
      <PuzzleMark className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-3" />
      {!compact && (
        <span className="font-display text-[1.15rem] font-semibold tracking-[-0.02em] text-cocoa">
          Puzzle <span className="font-light italic text-rosewood">Together</span>
        </span>
      )}
    </Link>
  );
}
