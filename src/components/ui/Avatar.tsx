import type { PlayerDto } from "../../../shared/protocol";
import { initials, cn } from "../../lib/utils";

export function Avatar({
  player,
  size = "md",
  className,
  showOnline = true,
}: {
  player: Pick<PlayerDto, "name" | "color" | "online">;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showOnline?: boolean;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[0.55rem]",
    sm: "h-8 w-8 text-[0.65rem]",
    md: "h-10 w-10 text-[0.76rem]",
    lg: "h-12 w-12 text-[0.85rem]",
  } as const;

  return (
    <span className={cn("relative inline-flex shrink-0", className)} title={player.name}>
      <span
        className={cn(
          "grid place-items-center rounded-full font-semibold tracking-wide text-white ring-2 ring-parchment",
          sizes[size],
        )}
        style={{ backgroundColor: player.color }}
        aria-hidden="true"
      >
        {initials(player.name)}
      </span>
      {showOnline && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-parchment",
            player.online ? "bg-[#6f8f6f]" : "bg-cocoa/25",
          )}
          title={player.online ? `${player.name} is here` : `${player.name} is away`}
        />
      )}
      <span className="sr-only">
        {player.name}
        {player.online ? ", online" : ", away"}
      </span>
    </span>
  );
}
