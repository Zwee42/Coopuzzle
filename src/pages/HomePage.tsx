import {
  ArrowRight,
  Heart,
  Image as ImageIcon,
  Link2,
  Lock,
  Puzzle,
  Sparkles,
  Users,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DEFAULT_IMAGES } from "../../shared/defaults";
import { Logo } from "../components/Logo";
import { PuzzleArtwork } from "../components/puzzle/PuzzleArtwork";
import { buttonClasses, inputClasses } from "../components/ui/Button";
import { cn } from "../lib/utils";

const steps = [
  {
    icon: ImageIcon,
    title: "Choose a little world",
    copy: "Pick one of our illustrations or bring a photo that means something. Then set how many pieces you feel like.",
  },
  {
    icon: Link2,
    title: "Send one private link",
    copy: "No accounts, no app store, no guest list. Your room is unlisted and stays open until you close it.",
  },
  {
    icon: Puzzle,
    title: "Fit it together, slowly",
    copy: "Pieces snap into place for everyone at once. Leave and come back whenever — the board waits for you.",
  },
] as const;

const features = [
  {
    icon: Lock,
    title: "Private by design",
    copy: "Unlisted rooms with a seven-letter code. Nothing is public, indexed or discoverable.",
  },
  {
    icon: Sparkles,
    title: "Live, not lively",
    copy: "See a partner's cursor, the piece in their hand, and the exact moment it clicks home.",
  },
  {
    icon: Users,
    title: "Two, or a few",
    copy: "Built for couples first, with room for up to four people when the sofa gets crowded.",
  },
  {
    icon: Heart,
    title: "No clock, no score",
    copy: "No timers, streaks or leaderboards. Just a picture, some pieces and however long it takes.",
  },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const message = (location.state as { message?: string } | null)?.message;

  function joinWithCode(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== 7) {
      setCodeError("Room codes are seven characters long.");
      return;
    }
    setCodeError(null);
    navigate(`/join/${normalized}`);
  }

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 pb-4 pt-[calc(1.1rem+var(--safe-top))] sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <a
            href="#how"
            className="hidden rounded-full px-3 py-2 text-sm text-cocoa-soft transition hover:bg-cocoa/[0.05] hover:text-cocoa sm:block"
          >
            How it works
          </a>
          <Link to="/join" className={buttonClasses("secondary", "sm")}>
            Join a room
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-24 lg:pt-16">
          <div className="relative">
            {message && (
              <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-sage/25 bg-sage-soft/60 px-4 py-3 text-sm text-[#45604c]">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{message}</span>
              </div>
            )}
            <p className="inline-flex items-center gap-2 rounded-full border border-rosewood/15 bg-white/45 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-rosewood">
              <Heart className="h-3 w-3" aria-hidden="true" />
              A quiet place for two
            </p>
            <h1 className="mt-5 max-w-xl font-display text-[clamp(2.65rem,6vw,4.8rem)] font-semibold leading-[0.96] tracking-[-0.035em] text-cocoa text-balance">
              Put a little <span className="font-light italic text-rosewood">moment</span> back
              together.
            </h1>
            <p className="mt-6 max-w-lg text-[1.02rem] leading-relaxed text-cocoa-soft text-pretty sm:text-[1.08rem]">
              A private jigsaw room for you and someone you love. Pick a picture, pour something
              warm, and fill in the pieces whenever you like — together, in real time.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/create" className={buttonClasses("primary", "lg")}>
                Start a puzzle
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#how" className={buttonClasses("ghost", "lg")}>
                See how it works
              </a>
            </div>

            <form
              onSubmit={joinWithCode}
              className="mt-7 flex max-w-md items-start gap-2.5 rounded-[22px] border border-white/60 bg-white/35 p-2.5 shadow-[0_18px_45px_-38px_rgba(57,37,33,0.5)] backdrop-blur-sm"
            >
              <label className="sr-only" htmlFor="home-code">
                Invite code
              </label>
              <input
                id="home-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7));
                  setCodeError(null);
                }}
                placeholder="Invite code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={7}
                className={cn(
                  inputClasses,
                  "h-11 flex-1 border-transparent bg-white/70 font-semibold uppercase tracking-[0.18em] placeholder:font-normal placeholder:tracking-normal placeholder:normal-case",
                )}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? "home-code-error" : undefined}
              />
              <button type="submit" className={buttonClasses("secondary", "md", "shrink-0")}>
                Join
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
            {codeError && (
              <p id="home-code-error" className="mt-2 pl-2 text-xs text-[#8f3f3a]" role="alert">
                {codeError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.74rem] text-cocoa-soft/85">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-sage" aria-hidden="true" /> No accounts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-sage" aria-hidden="true" /> Private by link
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-sage" aria-hidden="true" /> Saved automatically
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[590px] lg:mx-0">
            <div
              aria-hidden="true"
              className="absolute -left-7 top-10 hidden h-40 w-40 rounded-full bg-blush/60 blur-3xl sm:block"
            />
            <div
              aria-hidden="true"
              className="absolute -right-4 bottom-0 h-44 w-44 rounded-full bg-sage-soft/80 blur-3xl"
            />
            <div className="relative">
              <PuzzleArtwork
                imageUrl={DEFAULT_IMAGES[0].url}
                aspect={DEFAULT_IMAGES[0].width / DEFAULT_IMAGES[0].height}
                rows={4}
                cols={6}
                seed={23}
                liftedPiece={{ row: 2, col: 3 }}
                className="float-slow [--float-rotate:-1.4deg]"
              />

              <div className="float-slower absolute -left-3 top-6 flex items-center gap-2 rounded-2xl border border-white/75 bg-cream/90 px-3 py-2.5 shadow-[0_20px_45px_-25px_rgba(57,37,33,0.5)] backdrop-blur-sm sm:-left-8">
                <span className="flex -space-x-2">
                  {[
                    { name: "Maya", color: "#b95f54" },
                    { name: "Theo", color: "#63816d" },
                    { name: "June", color: "#a77b32" },
                  ].map((person) => (
                    <span
                      key={person.name}
                      className="grid h-7 w-7 place-items-center rounded-full border-2 border-cream text-[0.55rem] font-semibold text-white"
                      style={{ backgroundColor: person.color }}
                      title={person.name}
                    >
                      {person.name.slice(0, 1)}
                    </span>
                  ))}
                </span>
                <span className="text-[0.68rem] font-medium leading-tight text-cocoa-soft">
                  Here together
                  <span className="block text-[0.6rem] font-normal text-cocoa-soft/75">
                    right now
                  </span>
                </span>
              </div>

              <div className="float-slow absolute -bottom-6 left-1 w-44 rounded-2xl border border-white/75 bg-cream/90 p-3 shadow-[0_22px_50px_-26px_rgba(57,37,33,0.5)] backdrop-blur-sm sm:-left-6">
                <div className="flex items-center justify-between text-[0.62rem] font-medium uppercase tracking-[0.13em] text-cocoa-soft">
                  <span>Our puzzle</span>
                  <span className="text-rosewood">12 / 48</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cocoa/10">
                  <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-rosewood to-[#d69a7c]" />
                </div>
                <p className="mt-2 text-[0.66rem] leading-snug text-cocoa-soft/80">
                  “The little tab goes here…”
                </p>
              </div>

              <div className="absolute -right-1 top-5 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-cream/90 px-2.5 py-1 text-[0.62rem] font-semibold text-[#45604c] shadow-sm backdrop-blur-sm sm:right-3">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage" />
                </span>
                Live
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-8 px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
              How it works
            </p>
            <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.025em] text-cocoa text-balance">
              Three small steps to a slow evening.
            </h2>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="group relative overflow-hidden rounded-[26px] border border-white/65 bg-white/40 p-6 shadow-[0_22px_55px_-45px_rgba(57,37,33,0.55)] backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:bg-white/60"
              >
                <span className="absolute right-5 top-4 font-display text-4xl font-light text-cocoa/[0.07]">
                  0{index + 1}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blush/70 text-rosewood transition duration-300 group-hover:rotate-[-4deg] group-hover:bg-blush">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold text-cocoa">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cocoa-soft">{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
                The little gallery
              </p>
              <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.025em] text-cocoa">
                Pick a world to put together.
              </h2>
            </div>
            <Link to="/create" className={buttonClasses("secondary", "md")}>
              See all sizes
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {DEFAULT_IMAGES.map((image) => (
              <Link
                key={image.id}
                to={`/create?image=${image.id}`}
                className="group overflow-hidden rounded-[24px] border border-white/70 bg-white/40 p-2 shadow-[0_20px_45px_-40px_rgba(57,37,33,0.6)] outline-none transition duration-300 hover:-translate-y-1 hover:bg-white/65 focus-visible:ring-2 focus-visible:ring-rosewood"
              >
                <div className="overflow-hidden rounded-[17px]">
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="aspect-[8/5] w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-3">
                  <span className="font-display text-[1.02rem] font-semibold text-cocoa">
                    {image.title}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: image.accent }}
                    aria-hidden="true"
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
                Made for slow evenings
              </p>
              <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.025em] text-cocoa text-balance">
                Everything you need. Nothing that hurries you.
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-cocoa-soft">
                No sign-ups, notifications or streaks. Just a shared board that remembers where you
                left off.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-[22px] border border-white/60 bg-white/35 p-5 backdrop-blur-sm"
                >
                  <feature.icon className="h-5 w-5 text-rosewood" aria-hidden="true" />
                  <h3 className="mt-3.5 font-display text-lg font-semibold text-cocoa">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[0.82rem] leading-relaxed text-cocoa-soft">
                    {feature.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="relative overflow-hidden rounded-[34px] border border-white/60 bg-[linear-gradient(135deg,rgba(243,221,212,0.75),rgba(255,250,242,0.7)_45%,rgba(226,233,223,0.7))] px-6 py-12 text-center shadow-[0_35px_90px_-60px_rgba(57,37,33,0.55)] sm:px-12 sm:py-16">
            <div
              aria-hidden="true"
              className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-white/40 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-16 -right-8 h-56 w-56 rounded-full bg-rosewood/10 blur-3xl"
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
                <Heart className="h-3 w-3" aria-hidden="true" />
                Your table is ready
              </p>
              <h2 className="mx-auto mt-4 max-w-xl font-display text-[clamp(2.1rem,4.5vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-cocoa text-balance">
                There is a puzzle with your name on it.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-cocoa-soft">
                Well — with both your names on it. Choose a picture and send the link.
              </p>
              <Link to="/create" className={buttonClasses("primary", "lg", "mt-7")}>
                Start a puzzle
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-cocoa/[0.07]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-7 text-center sm:flex-row sm:px-8 sm:text-left">
          <Logo compact />
          <p className="text-[0.72rem] text-cocoa-soft/80">
            Made for two, with room for a few. No accounts, no noise.
          </p>
          <div className="flex items-center gap-4 text-[0.72rem] text-cocoa-soft">
            <Link to="/join" className="transition hover:text-cocoa">
              Join a room
            </Link>
            <Link to="/create" className="transition hover:text-cocoa">
              Create a room
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
