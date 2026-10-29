import { Check, Loader2, Upload } from "lucide-react";
import { useRef, type DragEvent } from "react";
import { DEFAULT_IMAGES } from "../../../shared/defaults";
import type { ImageChoiceController } from "../../lib/useImageChoice";
import { cn } from "../../lib/utils";

export interface KeepImage {
  url: string;
  width: number;
  height: number;
  title?: string;
}

export function ImageChooser({
  controller,
  allowKeep = false,
  keepImage,
}: {
  controller: ImageChoiceController;
  allowKeep?: boolean;
  keepImage?: KeepImage;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { choice, processing, error } = controller;

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void controller.chooseFile(file);
  }

  return (
    <fieldset>
      <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-cocoa-soft">
        The picture
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {allowKeep && keepImage && (
          <button
            type="button"
            onClick={() => controller.keepCurrent(keepImage)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-white/45 p-1.5 text-left outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-rosewood",
              choice.kind === "keep"
                ? "border-rosewood/60 shadow-[0_0_0_3px_rgba(185,95,84,0.1)]"
                : "border-cocoa/10",
            )}
            aria-pressed={choice.kind === "keep"}
          >
            <div className="relative overflow-hidden rounded-[11px] bg-parchment-deep">
              <img
                src={keepImage.url}
                alt=""
                className="aspect-[8/5] w-full object-cover"
                draggable={false}
              />
              <span className="absolute inset-0 grid place-items-center bg-cocoa/0 opacity-0 transition group-hover:bg-cocoa/10 group-hover:opacity-100">
                {choice.kind === "keep" && (
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-rosewood text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
              </span>
            </div>
            <span className="block px-1 pb-0.5 pt-2 text-[0.72rem] font-medium leading-tight text-cocoa">
              Keep this picture
            </span>
          </button>
        )}

        {DEFAULT_IMAGES.map((image) => {
          const selected = choice.kind === "default" && choice.id === image.id;
          return (
            <button
              key={image.id}
              type="button"
              onClick={() => controller.chooseDefault(image.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-white/45 p-1.5 text-left outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-rosewood",
                selected
                  ? "border-rosewood/60 shadow-[0_0_0_3px_rgba(185,95,84,0.1)]"
                  : "border-cocoa/10",
              )}
              aria-pressed={selected}
              title={image.alt}
            >
              <div className="relative overflow-hidden rounded-[11px]">
                <img
                  src={image.url}
                  alt={image.alt}
                  className="aspect-[8/5] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                  loading="lazy"
                  draggable={false}
                />
                {selected && (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-rosewood text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
              </div>
              <span className="block px-1 pb-0.5 pt-2 text-[0.72rem] font-medium leading-tight text-cocoa">
                {image.title}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "group relative overflow-hidden rounded-2xl border border-dashed bg-white/35 p-1.5 text-left outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-white/65 focus-visible:ring-2 focus-visible:ring-rosewood",
            choice.kind === "upload"
              ? "border-rosewood/60 shadow-[0_0_0_3px_rgba(185,95,84,0.1)]"
              : "border-cocoa/20",
          )}
          aria-pressed={choice.kind === "upload"}
        >
          <div className="relative overflow-hidden rounded-[11px] bg-parchment-deep/70">
            {choice.kind === "upload" ? (
              <img
                src={choice.previewUrl}
                alt="Your uploaded photo"
                className="aspect-[8/5] w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="grid aspect-[8/5] w-full place-items-center text-cocoa-soft/70">
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
            )}
            {choice.kind === "upload" && (
              <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-rosewood text-white shadow-sm">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
          </div>
          <span className="block px-1 pb-0.5 pt-2 text-[0.72rem] font-medium leading-tight text-cocoa">
            {processing ? "Preparing…" : "Your own photo"}
          </span>
          <span className="block px-1 pb-0.5 text-[0.6rem] leading-tight text-cocoa-soft/75">
            JPEG, PNG or WebP
          </span>
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void controller.chooseFile(file);
          event.target.value = "";
        }}
      />

      {error && (
        <p className="mt-3 rounded-xl border border-[#a85f54]/20 bg-[#fff7f2]/80 px-3 py-2 text-xs leading-relaxed text-[#743d37]" role="alert">
          {error}
        </p>
      )}
      {choice.kind === "upload" && !processing && (
        <p className="mt-2.5 truncate text-[0.68rem] text-cocoa-soft/80">
          {choice.name} · {choice.width} × {choice.height}px, resized for the web
        </p>
      )}
    </fieldset>
  );
}
