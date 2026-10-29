import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Heart,
  Loader2,
  Lock,
  Puzzle,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { RoomPreview } from "../../shared/protocol";
import { Logo } from "../components/Logo";
import { Button, buttonClasses, inputClasses } from "../components/ui/Button";
import { ApiRequestError, getRoomPreview, joinRoom } from "../lib/api";
import {
  clearSession,
  readRememberedName,
  readSession,
  rememberName,
  saveSession,
} from "../lib/storage";
import { cn, formatRoomCode, pluralize } from "../lib/utils";

export function JoinPage() {
  const { code } = useParams<{ code?: string }>();
  if (!code) return <JoinLanding />;
  return <JoinRoom code={code.trim().toUpperCase()} />;
}

function JoinLanding() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== 7) {
      setError("Room codes are seven characters long.");
      return;
    }
    setError(null);
    navigate(`/join/${normalized}`);
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pb-4 pt-[calc(1.1rem+var(--safe-top))] sm:px-8">
        <Logo />
        <Link to="/create" className={buttonClasses("secondary", "sm")}>
          Create a room
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-5xl items-center gap-8 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:pt-20">
        <div className="relative order-2 lg:order-1">
          <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/40 p-2.5 shadow-[0_32px_80px_-55px_rgba(57,37,33,0.65)]">
            <div className="relative overflow-hidden rounded-[22px]">
              <img
                src="/defaults/sunday-morning.svg"
                alt="Two cups of coffee and a small vase of flowers in warm morning light"
                className="aspect-[8/5] w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#3f2d2a]/55 to-transparent p-5 pt-12">
                <p className="font-display text-2xl font-semibold text-white">Sunday Morning</p>
                <p className="mt-1 text-xs text-white/80">Somewhere at a table, together.</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-2 -top-4 hidden rotate-3 rounded-2xl border border-white/70 bg-cream/90 px-4 py-3 shadow-[0_18px_40px_-25px_rgba(57,37,33,0.55)] backdrop-blur-sm sm:block">
            <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-rosewood">
              <Heart className="h-3 w-3" aria-hidden="true" /> An invitation
            </p>
            <p className="mt-1 text-[0.66rem] text-cocoa-soft">Just for the two of you.</p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
            You have an invitation
          </p>
          <h1 className="mt-3 font-display text-[clamp(2.35rem,5vw,3.7rem)] font-semibold leading-[1] tracking-[-0.03em] text-cocoa text-balance">
            Someone saved you a seat.
          </h1>
          <p className="mt-4 max-w-md text-[0.96rem] leading-relaxed text-cocoa-soft">
            Enter the seven-character room code from your invite. No account, no password — just
            your name and a puzzle waiting on the table.
          </p>

          <form
            onSubmit={submit}
            className="mt-7 max-w-md rounded-[26px] border border-white/70 bg-[#fbf6ed]/85 p-4 shadow-[0_25px_60px_-50px_rgba(57,37,33,0.6)] backdrop-blur-sm sm:p-5"
          >
            <label
              htmlFor="join-code"
              className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft"
            >
              Room code
            </label>
            <div className="mt-2 flex gap-2.5">
              <input
                id="join-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7));
                  setError(null);
                }}
                placeholder="7 letters"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={7}
                className={cn(
                  inputClasses,
                  "font-semibold uppercase tracking-[0.2em] placeholder:font-normal placeholder:tracking-normal placeholder:normal-case",
                )}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "join-code-error" : undefined}
                autoFocus
              />
              <Button type="submit" className="shrink-0">
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {error && (
              <p id="join-code-error" role="alert" className="mt-2.5 text-xs text-[#8f3f3a]">
                {error}
              </p>
            )}
            <p className="mt-4 flex items-center gap-1.5 text-[0.68rem] text-cocoa-soft/80">
              <Lock className="h-3 w-3 text-sage" aria-hidden="true" />
              Rooms are unlisted. Only people with the link can find you.
            </p>
          </form>

          <p className="mt-6 text-sm text-cocoa-soft">
            Starting a new puzzle?{" "}
            <Link to="/create" className="font-medium text-rosewood underline-offset-4 hover:underline">
              Create a room instead
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function JoinRoom({ code }: { code: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const stateMessage = (location.state as { message?: string } | null)?.message;
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [savedSession, setSavedSession] = useState(() => readSession(code));
  const [name, setName] = useState(() => readSession(code)?.name ?? readRememberedName());
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(stateMessage ?? null);
  const [reloadKey, setReloadKey] = useState(0);
  const autoTried = useRef(false);
  const autoAttempt = useRef(0);
  const [autoState, setAutoState] = useState<"idle" | "trying" | "failed">(() =>
    savedSession ? "trying" : "idle",
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getRoomPreview(code, controller.signal)
      .then((response) => {
        setPreview(response.room);
        setLoading(false);
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setLoadError({
          code: error instanceof ApiRequestError ? error.code : "network_error",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "We could not reach the room. Check your connection and try again.",
        });
        setLoading(false);
      });
    return () => controller.abort();
  }, [code, reloadKey]);

  useEffect(() => {
    if (!preview || !savedSession || autoTried.current) return;
    autoTried.current = true;
    const attempt = ++autoAttempt.current;
    setAutoState("trying");
    setJoinError(null);
    joinRoom(code, { token: savedSession.token })
      .then((response) => {
        if (autoAttempt.current !== attempt) return;
        saveSession(code, {
          playerId: response.player.id,
          name: response.player.name,
          token: response.player.token,
        });
        rememberName(response.player.name);
        navigate(`/room/${code}`, { replace: true });
      })
      .catch((error) => {
        if (autoAttempt.current !== attempt) return;
        if (
          error instanceof ApiRequestError &&
          (error.code === "session_expired" || error.code === "not_authorized")
        ) {
          clearSession(code);
          setSavedSession(null);
          setAutoState("idle");
          setNotice("Your saved seat has expired. Add your name to take a new one.");
          return;
        }
        setAutoState("failed");
        setJoinError(
          error instanceof ApiRequestError
            ? error.message
            : "We could not reach the room. Check your connection and try again.",
        );
      });
  }, [preview, savedSession, code, navigate]);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (joining) return;
    const cleanName = name.trim();
    if (cleanName.length === 0) {
      setJoinError("Add a name so everyone knows who is here.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const response = await joinRoom(code, { name: cleanName });
      saveSession(code, {
        playerId: response.player.id,
        name: response.player.name,
        token: response.player.token,
      });
      rememberName(response.player.name);
      navigate(`/room/${code}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.code === "session_expired" || error.code === "not_authorized") {
          clearSession(code);
          setSavedSession(null);
        }
        setJoinError(error.message);
      } else {
        setJoinError("We could not join the room. Check your connection and try again.");
      }
      setJoining(false);
    }
  }

  function retryAutoJoin() {
    autoTried.current = false;
    setAutoState("idle");
    setJoinError(null);
    setNotice(null);
  }

  function joinAsSomeoneNew() {
    autoAttempt.current++;
    clearSession(code);
    setSavedSession(null);
    setAutoState("idle");
    setJoinError(null);
    setNotice(null);
    autoTried.current = true;
  }

  const header = (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 pb-4 pt-[calc(1.1rem+var(--safe-top))] sm:px-8">
      <Logo />
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-cocoa-soft transition hover:bg-cocoa/[0.05] hover:text-cocoa"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Home
      </Link>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-dvh">
        {header}
        <main className="mx-auto grid w-full max-w-4xl place-items-center px-5 py-24">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-white/70 bg-white/50 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-rosewood" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-xl font-semibold text-cocoa">Finding your room…</p>
              <p className="mt-1 text-sm text-cocoa-soft">Checking code {formatRoomCode(code)}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (loadError || !preview) {
    const notFound = loadError?.code === "room_not_found";
    return (
      <div className="min-h-dvh">
        {header}
        <main className="mx-auto grid w-full max-w-2xl place-items-center px-5 py-20">
          <div className="w-full rounded-[30px] border border-white/70 bg-[#fbf6ed]/85 p-7 text-center shadow-[0_30px_80px_-60px_rgba(57,37,33,0.65)] backdrop-blur-sm sm:p-10">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-blush/70 text-rosewood">
              {notFound ? (
                <Puzzle className="h-6 w-6" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              )}
            </span>
            <h1 className="mt-5 font-display text-3xl font-semibold text-cocoa">
              {notFound ? "This room has closed." : "We could not find that room."}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-cocoa-soft">
              {notFound
                ? "The host may have put the puzzle away. Ask them for a fresh invite, or start a new room of your own."
                : loadError?.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {!notFound && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    autoTried.current = false;
                    setReloadKey((value) => value + 1);
                  }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              )}
              <Link to="/create" className={buttonClasses("primary", "md")}>
                Start a new puzzle
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const full = preview.playerCount >= preview.capacity && !savedSession;
  const date = new Date(preview.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh">
      {header}
      <main className="mx-auto grid w-full max-w-5xl gap-6 px-5 pb-20 pt-6 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:items-start lg:gap-9 lg:pt-10">
        <div className="relative">
          <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/40 p-2.5 shadow-[0_32px_80px_-55px_rgba(57,37,33,0.65)]">
            <div className="relative overflow-hidden rounded-[22px]">
              <img
                src={preview.image.url}
                alt={preview.image.title ?? "The puzzle picture"}
                className="aspect-[8/5] w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#3f2d2a]/65 via-[#3f2d2a]/20 to-transparent p-5 pt-16 sm:p-6">
                <p className="font-display text-[1.6rem] font-semibold leading-tight text-white sm:text-3xl">
                  {preview.name}
                </p>
                <p className="mt-1 text-xs text-white/80">
                  Hosted by {preview.hostName} · opened {date}
                </p>
              </div>
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-cream/90 px-2.5 py-1 text-[0.65rem] font-semibold text-cocoa shadow-sm backdrop-blur-sm">
                <Puzzle className="h-3 w-3 text-rosewood" aria-hidden="true" />
                {preview.totalPieces} pieces
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/60 bg-white/35 px-4 py-3">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-cocoa-soft">
                At the table
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-cocoa">
                <Users className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
                {preview.playerCount} of {preview.capacity} seats
              </p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/35 px-4 py-3">
              <p className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-cocoa-soft">
                The picture
              </p>
              <p className="mt-1 truncate text-sm font-medium text-cocoa">
                {preview.image.title ?? "A personal photo"}
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-[30px] border border-white/70 bg-[#fbf6ed]/88 p-5 shadow-[0_30px_80px_-60px_rgba(57,37,33,0.65)] backdrop-blur-sm sm:p-7">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-rosewood">
            {savedSession ? "Welcome back" : "Take your seat"}
          </p>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-tight text-cocoa sm:text-[2.35rem]">
            {savedSession ? `Good to see you, ${savedSession.name}.` : "Join the puzzle."}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-cocoa-soft">
            {savedSession
              ? "We saved your place at the table. Your board is just as you left it."
              : `${preview.hostName} is putting together a ${preview.totalPieces}-piece puzzle. Add your name and pick up a piece.`}
          </p>

          {notice && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-gold/25 bg-[#fbf3e2]/80 px-3.5 py-2.5 text-xs leading-relaxed text-[#7a5a28]">
              <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          )}

          {savedSession && autoState === "trying" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-[22px] border border-white/70 bg-white/45 px-5 py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-rosewood" aria-hidden="true" />
              <p className="text-sm font-medium text-cocoa">Rejoining as {savedSession.name}…</p>
              <p className="text-xs text-cocoa-soft">Finding your saved seat.</p>
            </div>
          )}

          {savedSession && autoState === "failed" && (
            <div className="mt-5">
              <p className="rounded-2xl border border-[#a85f54]/20 bg-[#fff7f2]/90 px-4 py-3 text-sm leading-relaxed text-[#743d37]" role="alert">
                {joinError}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={retryAutoJoin} loading={joining}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Try rejoining
                </Button>
                <Button variant="ghost" onClick={joinAsSomeoneNew}>
                  Join as someone new
                </Button>
              </div>
            </div>
          )}

          {(!savedSession || autoState === "idle") && (
            <form onSubmit={handleJoin} className="mt-5">
              <label htmlFor="join-name" className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
                Your name
              </label>
              <input
                id="join-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value.slice(0, 24));
                  setJoinError(null);
                }}
                placeholder="What should we call you?"
                autoComplete="nickname"
                maxLength={24}
                className={cn(inputClasses, "mt-2")}
                disabled={full}
                required
              />

              {joinError && (
                <p role="alert" className="mt-3 rounded-2xl border border-[#a85f54]/20 bg-[#fff7f2]/90 px-4 py-3 text-sm leading-relaxed text-[#743d37]">
                  {joinError}
                </p>
              )}

              {full ? (
                <div className="mt-4 rounded-2xl border border-cocoa/10 bg-white/40 px-4 py-3 text-sm leading-relaxed text-cocoa-soft">
                  <span className="font-medium text-cocoa">This room is full.</span> It already has{" "}
                  {preview.capacity} {pluralize(preview.capacity, "person", "people")}. Ask the host
                  to start a fresh room, or make one of your own.
                </div>
              ) : (
                <Button type="submit" size="lg" className="mt-4 w-full" loading={joining}>
                  Take my seat
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}

              <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.68rem] text-cocoa-soft/80">
                <Lock className="h-3 w-3 text-sage" aria-hidden="true" />
                No account. Your seat is remembered on this device.
              </p>
            </form>
          )}

          {savedSession && autoState === "trying" && (
            <button
              type="button"
              onClick={joinAsSomeoneNew}
              className="mt-5 w-full text-center text-xs text-cocoa-soft underline-offset-4 transition hover:text-cocoa hover:underline"
            >
              Not {savedSession.name}? Join as someone else
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
