import { ArrowLeft, Puzzle } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { buttonClasses } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col">
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
      <main className="grid flex-1 place-items-center px-5 pb-20">
        <div className="max-w-md text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] border border-white/70 bg-white/45 text-rosewood shadow-sm">
            <Puzzle className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="mt-6 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-rosewood">
            A missing piece
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.03em] text-cocoa">
            This page is not in the box.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-cocoa-soft">
            The link may be old, or the address may have a typo. The table is still set at home.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/" className={buttonClasses("primary", "md")}>
              Back home
            </Link>
            <Link to="/join" className={buttonClasses("secondary", "md")}>
              Join a room
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
