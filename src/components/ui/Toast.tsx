import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "../../lib/utils";

export type ToastTone = "info" | "success" | "error";

export interface ToastNotice {
  seq: number;
  message: string;
  tone: ToastTone;
}

const icons = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

export function Toast({
  notice,
  onDismiss,
  className,
}: {
  notice: ToastNotice | null;
  onDismiss: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(onDismiss, notice.tone === "error" ? 4400 : 3000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;
  const Icon = icons[notice.tone];

  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={cn(
        "toast-enter pointer-events-auto flex max-w-[min(92vw,430px)] items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-[0_18px_45px_-20px_rgba(53,36,37,0.5)] backdrop-blur-md",
        notice.tone === "error"
          ? "border-[#a85f54]/25 bg-[#fff7f2]/95 text-[#743d37]"
          : notice.tone === "success"
            ? "border-sage/25 bg-[#f7fbf4]/95 text-[#45604c]"
            : "border-cocoa/10 bg-white/90 text-cocoa",
        className,
      )}
    >
      <Icon
        className={cn(
          "h-4.5 w-4.5 shrink-0",
          notice.tone === "error" ? "text-[#a85f54]" : notice.tone === "success" ? "text-sage" : "text-cocoa-soft",
        )}
        aria-hidden="true"
      />
      <span className="leading-snug">{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-60 outline-none transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
