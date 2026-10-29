import type { ConnectionState } from "../../state/gameReducer";
import { cn } from "../../lib/utils";

const labels: Record<ConnectionState, string> = {
  connecting: "Connecting",
  open: "Live",
  reconnecting: "Reconnecting",
  closed: "Offline",
};

export function ConnectionBadge({ state, className }: { state: ConnectionState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-cocoa/10 bg-white/45 px-2.5 py-1 text-[0.68rem] font-medium text-cocoa-soft",
        className,
      )}
      title={
        state === "open"
          ? "Connected to the shared puzzle"
          : state === "reconnecting"
            ? "Trying to reconnect"
            : state === "connecting"
              ? "Connecting to the shared puzzle"
              : "Not connected"
      }
    >
      <span className="relative flex h-1.5 w-1.5">
        {state === "open" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            state === "open"
              ? "bg-sage"
              : state === "connecting" || state === "reconnecting"
                ? "bg-gold"
                : "bg-cocoa/30",
          )}
        />
      </span>
      {labels[state]}
    </span>
  );
}
