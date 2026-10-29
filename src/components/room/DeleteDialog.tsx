import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";
import type { RoomDto } from "../../../shared/protocol";
import { ApiRequestError, deleteRoom } from "../../lib/api";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function DeleteDialog({
  room,
  token,
  onClose,
  onDeleted,
}: {
  room: RoomDto;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteRoom(room.code, token);
      onDeleted();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "We could not delete the room. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Put the room away?"
      description={`This permanently closes “${room.name}” for everyone.`}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-[#8f3f3a]/20 bg-[#fff4f1]/85 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#8f3f3a]" aria-hidden="true" />
          <div className="text-[0.8rem] leading-relaxed text-[#6e352f]">
            <p className="font-semibold">This cannot be undone.</p>
            <p className="mt-1">
              The picture, every placed piece and everyone's seat will be removed. Your partner
              will be sent back to the home page right away.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-cocoa/10 bg-white/40 px-4 py-3">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-cocoa-soft">
            Room to close
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-cocoa">{room.name}</p>
          <p className="mt-0.5 text-[0.7rem] text-cocoa-soft">
            {room.totalPieces} pieces · {room.placedCount} placed · code {room.code}
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-[#a85f54]/20 bg-[#fff7f2]/90 px-4 py-3 text-sm leading-relaxed text-[#743d37]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2.5 border-t border-cocoa/[0.08] pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
            Keep the room
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDelete()}
            loading={submitting}
            className="flex-1 sm:flex-none"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete forever
          </Button>
        </div>
      </div>
    </Modal>
  );
}
