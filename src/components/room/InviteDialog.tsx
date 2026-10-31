import { Check, Copy, Link2, Lock, QrCode, Share2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PlayerDto, RoomDto } from "../../../shared/protocol";
import { copyText, formatRoomCode, pluralize } from "../../lib/utils";
import { Avatar } from "../ui/Avatar";
import { Button, buttonClasses } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function InviteDialog({
  open,
  room,
  players,
  you,
  onClose,
}: {
  open: boolean;
  room: RoomDto;
  players: PlayerDto[];
  you: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inviteUrl = `${window.location.origin}/join/${room.code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (open) {
      setCopied(null);
      setError(null);
    }
  }, [open]);

  async function copy(kind: "link" | "code") {
    const value = kind === "link" ? inviteUrl : room.code;
    const ok = await copyText(value);
    if (ok) {
      setCopied(kind);
      setError(null);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2200);
    } else {
      setError("Your browser blocked copying. Select the link above and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: `${room.name} — Puzzle Together`,
        text: `Come put a puzzle together with me. Room code ${room.code}.`,
        url: inviteUrl,
      });
    } catch {
      // The share sheet was dismissed, or sharing is unavailable.
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bring someone in"
      description="Send this private link to the person you want at the table. No account needed."
    >
      <div className="space-y-5">
        <div>
          <label
            htmlFor="invite-link"
            className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft"
          >
            Invite link
          </label>
          <div className="mt-2 flex items-stretch gap-2">
            <input
              id="invite-link"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-cocoa/12 bg-white/65 px-3.5 text-sm text-cocoa outline-none focus:border-rosewood/45 focus:ring-4 focus:ring-rosewood/10"
            />
            <button
              type="button"
              onClick={() => void copy("link")}
              className={buttonClasses("primary", "md", "shrink-0 px-4")}
              aria-label="Copy invite link"
            >
              {copied === "link" ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{copied === "link" ? "Copied" : "Copy"}</span>
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-[#8f3f3a]">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 rounded-[22px] border border-cocoa/10 bg-white/35 p-4">
          <div
            data-testid="invite-qr"
            className="shrink-0 rounded-2xl border border-white/80 bg-white p-2 shadow-sm"
          >
            <QRCodeSVG
              value={inviteUrl}
              size={104}
              level="M"
              bgColor="#ffffff"
              fgColor="#3f2d2a"
              title="QR code for the invite link"
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-cocoa-soft">
              <QrCode className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
              Scan to join
            </p>
            <p className="mt-1 text-sm leading-relaxed text-cocoa">
              Point a phone camera at the code, or send the link above.
            </p>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-cocoa-soft/80">
              The room stays private and unlisted until you delete it or it expires.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 rounded-[22px] border border-cocoa/10 bg-white/35 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-cocoa-soft">
              Or read the code aloud
            </p>
            <p className="mt-1 font-mono text-[1.35rem] font-semibold tracking-[0.24em] text-cocoa">
              {formatRoomCode(room.code)}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => void copy("code")}
            >
              {copied === "code" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied === "code" ? "Copied" : "Copy code"}
            </Button>
            {canShare && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={() => void share()}
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Share
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-[22px] border border-white/60 bg-parchment-deep/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-cocoa-soft">
              <Users className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
              At the table
            </p>
            <p className="text-[0.68rem] text-cocoa-soft/80">
              {players.length} of {room.capacity} {pluralize(room.capacity, "seat")}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {players.map((player) => (
              <span
                key={player.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 py-1 pl-1 pr-3 text-[0.72rem] text-cocoa"
              >
                <Avatar player={player} size="xs" showOnline={false} />
                <span className="font-medium">{player.name}</span>
                {player.id === you && <span className="text-[0.62rem] text-cocoa-soft">you</span>}
                {player.isHost && <span className="text-[0.62rem] text-gold">host</span>}
              </span>
            ))}
            {Array.from({ length: Math.max(0, room.capacity - players.length) }).map((_, index) => (
              <span
                key={`empty-${index}`}
                className="inline-flex items-center gap-2 rounded-full border border-dashed border-cocoa/15 px-3 py-1.5 text-[0.68rem] text-cocoa-soft/60"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-cocoa/20" aria-hidden="true" />
                An empty seat
              </span>
            ))}
          </div>
        </div>

        <p className="flex items-start gap-2 text-[0.7rem] leading-relaxed text-cocoa-soft/80">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" aria-hidden="true" />
          The room is unlisted. Opening this link in your own browser brings you back to your saved
          seat — send it to someone else to add them.
        </p>

        <div className="flex items-center justify-between gap-3 border-t border-cocoa/[0.08] pt-4">
          <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-cocoa-soft/75">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Invite-only, always.
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
