import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
}

function DialogBody({ title, description, onClose, children, className, closeLabel }: Omit<ModalProps, "open">) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className="app-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div
        className={cn(
          "relative max-h-[90dvh] w-[min(94vw,590px)] overflow-y-auto rounded-[30px] border border-white/65 bg-parchment p-5 shadow-[0_35px_110px_-35px_rgba(53,36,37,0.55)] sm:p-7",
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-6 pr-2">
          <div>
            <h2 id={titleId} className="font-display text-[1.6rem] font-semibold leading-tight text-cocoa">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 max-w-md text-sm leading-relaxed text-cocoa-soft">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? "Close dialog"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-cocoa-soft outline-none transition hover:bg-cocoa/[0.06] hover:text-cocoa focus-visible:ring-2 focus-visible:ring-rosewood"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

export function Modal({ open, ...props }: ModalProps) {
  if (!open) return null;
  return <DialogBody {...props} />;
}
