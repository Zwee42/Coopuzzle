import { AlertTriangle, RotateCcw, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PieceTarget } from "../../../shared/difficulty";
import type { RoomDto } from "../../../shared/protocol";
import { ApiRequestError, startPuzzle } from "../../lib/api";
import { useImageChoice } from "../../lib/useImageChoice";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { DifficultyPicker } from "../setup/DifficultyPicker";
import { ImageChooser } from "../setup/ImageChooser";

export function RestartDialog({
  room,
  token,
  onClose,
  onStarted,
}: {
  room: RoomDto;
  token: string;
  onClose: () => void;
  onStarted: (room: RoomDto) => void;
}) {
  const image = useImageChoice({
    initial: {
      kind: "keep",
      url: room.image.url,
      width: room.image.width,
      height: room.image.height,
      title: room.image.title,
    },
    allowKeep: true,
  });
  const [pieces, setPieces] = useState<PieceTarget>(room.pieceTarget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (image.processing) {
      setError("Give the new photo a moment to finish preparing.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("pieceCount", String(pieces));
      image.appendTo(form);
      const response = await startPuzzle(room.code, token, form);
      onStarted(response.room);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "We could not start a new puzzle. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start a fresh puzzle?"
      description="This clears the board for everyone in the room. You can keep the picture or choose a different one."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-start gap-3 rounded-2xl border border-gold/25 bg-[#fbf3e2]/70 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <p className="text-[0.76rem] leading-relaxed text-[#7a5a28]">
            {room.placedCount > 0 ? (
              <>
                <span className="font-semibold">
                  {room.placedCount} of {room.totalPieces} pieces
                </span>{" "}
                are already home. They will all return to the tray.
              </>
            ) : (
              <>The current board is empty, so only the picture and piece count will change.</>
            )}{" "}
            Everyone will see the new puzzle at the same time.
          </p>
        </div>

        <ImageChooser controller={image} allowKeep keepImage={room.image} />
        <DifficultyPicker value={pieces} onChange={setPieces} />

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-[#a85f54]/20 bg-[#fff7f2]/90 px-4 py-3 text-sm leading-relaxed text-[#743d37]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2.5 border-t border-cocoa/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[0.68rem] text-cocoa-soft/80">
            <Sparkles className="h-3.5 w-3.5 text-rosewood" aria-hidden="true" />
            A new seed, a new arrangement.
          </p>
          <div className="flex gap-2.5">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
              Not now
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={image.processing}
              className="flex-1 sm:flex-none"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Start fresh
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
