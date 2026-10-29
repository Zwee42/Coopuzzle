import {
  Crown,
  Link2,
  LogOut,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PlayerDto, RoomDto } from "../../../shared/protocol";
import type { ConnectionState } from "../../state/gameReducer";
import { cn, formatRoomCode } from "../../lib/utils";
import { Logo } from "../Logo";
import { Avatar } from "../ui/Avatar";
import { buttonClasses } from "../ui/Button";
import { ConnectionBadge } from "../ui/ConnectionBadge";

interface RoomHeaderProps {
  room: RoomDto;
  players: PlayerDto[];
  you: string | null;
  connection: ConnectionState;
  isHost: boolean;
  onInvite: () => void;
  onRestart: () => void;
  onLeave: () => void;
  onDelete: () => void;
}

export function RoomHeader({
  room,
  players,
  you,
  connection,
  isHost,
  onInvite,
  onRestart,
  onLeave,
  onDelete,
}: RoomHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="relative z-40 shrink-0 border-b border-white/45 bg-parchment/65 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center gap-2.5 px-3 pt-[var(--safe-top)] sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <Logo className="hidden md:inline-flex" />
          <Logo compact className="md:hidden" />
          <span className="hidden h-7 w-px bg-cocoa/10 md:block" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[1.02rem] font-semibold leading-tight tracking-[-0.01em] text-cocoa sm:text-[1.12rem]">
                {room.name}
              </h1>
              <button
                type="button"
                onClick={onInvite}
                title="Show invite code"
                className="hidden shrink-0 rounded-full border border-cocoa/10 bg-white/45 px-2 py-0.5 font-mono text-[0.6rem] font-semibold tracking-[0.16em] text-cocoa-soft outline-none transition hover:border-cocoa/20 hover:bg-white/70 hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood sm:inline-block"
              >
                {formatRoomCode(room.code)}
              </button>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[0.64rem] text-cocoa-soft">
              <span className="tabular-nums">
                {room.placedCount}/{room.totalPieces} pieces
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-cocoa-soft/50" aria-hidden="true" />
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                {players.filter((player) => player.online).length} here
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ConnectionBadge state={connection} className="hidden sm:inline-flex" />
          <span
            className={cn(
              "relative flex h-1.5 w-1.5 sm:hidden",
              connection === "open" ? "text-sage" : "text-gold",
            )}
            title={
              connection === "open"
                ? "Connected"
                : connection === "closed"
                  ? "Offline"
                  : "Connecting"
            }
          >
            <span
              className={cn(
                "inline-flex h-1.5 w-1.5 rounded-full",
                connection === "open" ? "bg-sage" : "bg-gold",
              )}
            />
          </span>

          <div className="hidden -space-x-2 sm:flex">
            {players.slice(0, 4).map((player) => (
              <span key={player.id} className="relative">
                <Avatar
                  player={player}
                  size="sm"
                  className={player.id === you ? "ring-2 ring-rosewood/25 rounded-full" : undefined}
                />
                {player.isHost && (
                  <Crown
                    className="absolute -left-0.5 -top-1 h-3 w-3 text-gold drop-shadow-sm"
                    aria-label="Host"
                  />
                )}
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={onInvite}
            className={buttonClasses("soft", "sm", "px-3")}
            aria-label="Invite someone"
            title="Invite someone"
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">Invite</span>
          </button>
          <button
            type="button"
            onClick={onRestart}
            className={buttonClasses("secondary", "sm", "px-3")}
            aria-label="Start a new puzzle"
            title="Start a new puzzle"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">New puzzle</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={buttonClasses("ghost", "sm", "h-9 w-9 px-0")}
              aria-label="Room menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-white/80 bg-cream/95 p-1.5 shadow-[0_24px_60px_-25px_rgba(53,36,37,0.5)] backdrop-blur-md"
                >
                  <div className="px-3 pb-1.5 pt-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-cocoa-soft/70">
                    Room {formatRoomCode(room.code)}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onLeave();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-cocoa-soft transition hover:bg-cocoa/[0.055] hover:text-cocoa"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Leave room
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-[#8f3f3a] transition hover:bg-[#8f3f3a]/[0.07]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete room
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
