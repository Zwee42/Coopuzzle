import { ArrowLeft, ArrowRight, Lock, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { defaultImageById, DEFAULT_IMAGES } from "../../shared/defaults";
import type { PieceTarget } from "../../shared/difficulty";
import { Logo } from "../components/Logo";
import { DifficultyPicker } from "../components/setup/DifficultyPicker";
import { ImageChooser } from "../components/setup/ImageChooser";
import { PuzzleSetupPreview } from "../components/setup/PuzzleSetupPreview";
import { Button, inputClasses } from "../components/ui/Button";
import { ApiRequestError, createRoom } from "../lib/api";
import { readRememberedName, rememberName, saveSession } from "../lib/storage";
import { useImageChoice } from "../lib/useImageChoice";
import { cn } from "../lib/utils";

export function CreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedImage = defaultImageById(searchParams.get("image") ?? "");
  const [name, setName] = useState(() => readRememberedName());
  const [roomName, setRoomName] = useState("Our little puzzle");
  const [pieces, setPieces] = useState<PieceTarget>(48);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const image = useImageChoice({
    initial: { kind: "default", id: requestedImage?.id ?? DEFAULT_IMAGES[0].id },
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const cleanName = name.trim();
    if (cleanName.length === 0) {
      setError("Add a name so your partner knows who is here.");
      return;
    }
    if (cleanName.length > 24) {
      setError("Keep your name to 24 characters or fewer.");
      return;
    }
    if (image.processing) {
      setError("Give the photo a moment to finish preparing.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("hostName", cleanName);
      form.append("roomName", roomName.trim() || "Our little puzzle");
      form.append("pieceCount", String(pieces));
      image.appendTo(form);

      const response = await createRoom(form);
      saveSession(response.room.code, {
        playerId: response.player.id,
        name: response.player.name,
        token: response.player.token,
      });
      rememberName(response.player.name);
      navigate(`/room/${response.room.code}`, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "We could not open that room. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pb-4 pt-[calc(1.1rem+var(--safe-top))] sm:px-8">
        <Logo />
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-cocoa-soft transition hover:bg-cocoa/[0.05] hover:text-cocoa"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back home
        </Link>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
            A room of your own
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.35rem,5vw,3.8rem)] font-semibold leading-[1] tracking-[-0.03em] text-cocoa text-balance">
            Set the table for two.
          </h1>
          <p className="mt-4 max-w-xl text-[0.98rem] leading-relaxed text-cocoa-soft">
            Choose a picture and a piece count. We will make a private room and an invite link you
            can send to your person. You can change it all again later.
          </p>
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10">
          <form
            onSubmit={handleSubmit}
            className="order-1 rounded-[30px] border border-white/70 bg-[#fbf6ed]/85 p-5 shadow-[0_28px_70px_-55px_rgba(57,37,33,0.65)] backdrop-blur-sm sm:p-7"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
                  Your name
                </span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value.slice(0, 24));
                    setError(null);
                  }}
                  placeholder="Maya"
                  autoComplete="nickname"
                  maxLength={24}
                  className={inputClasses}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
                  Room name <span className="font-normal normal-case tracking-normal">(optional)</span>
                </span>
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value.slice(0, 40))}
                  placeholder="Our little puzzle"
                  maxLength={40}
                  className={inputClasses}
                />
              </label>
            </div>

            <div className="mt-7">
              <ImageChooser controller={image} />
            </div>

            <div className="mt-7">
              <DifficultyPicker value={pieces} onChange={setPieces} />
            </div>

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-2xl border border-[#a85f54]/20 bg-[#fff7f2]/90 px-4 py-3 text-sm leading-relaxed text-[#743d37]"
              >
                {error}
              </p>
            )}

            <div className="mt-7 flex flex-col gap-4 border-t border-cocoa/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-[0.72rem] text-cocoa-soft">
                <Lock className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
                Private, unlisted, and yours until you delete it.
              </p>
              <Button type="submit" size="lg" loading={submitting} disabled={image.processing}>
                Create our room
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>

          <aside className="order-2 lg:pt-2">
            <div className="lg:sticky lg:top-8">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-blush/70 text-rosewood">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
                    A peek at the table
                  </p>
                  <p className="text-[0.7rem] text-cocoa-soft/75">
                    {image.title} · {pieces} pieces
                  </p>
                </div>
              </div>
              <PuzzleSetupPreview
                imageUrl={image.imageUrl}
                aspect={image.aspect}
                pieces={pieces}
              />
              <div className="mt-5 rounded-[22px] border border-white/60 bg-white/30 p-4">
                <p className="text-[0.78rem] leading-relaxed text-cocoa-soft">
                  <span className="font-medium text-cocoa">A small note:</span> the host can close
                  the room later. Everyone in the room can start a fresh puzzle, and the board
                  saves after every single piece.
                </p>
              </div>
              <div className={cn("mt-4 hidden items-center gap-2 px-1 text-[0.68rem] text-cocoa-soft/70 lg:flex")}>
                <span className="h-1 w-1 rounded-full bg-rosewood/50" aria-hidden="true" />
                Previews use the real piece shapes from your puzzle.
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
