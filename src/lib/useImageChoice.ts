import { useEffect, useRef, useState } from "react";
import { defaultImageById, DEFAULT_IMAGES } from "../../shared/defaults";
import { preparePuzzleImage, validateImageFile } from "./image";

export type ImageChoice =
  | { kind: "default"; id: string }
  | {
      kind: "upload";
      file: File;
      width: number;
      height: number;
      previewUrl: string;
      name: string;
    }
  | {
      kind: "keep";
      url: string;
      width: number;
      height: number;
      title?: string;
    };

interface UseImageChoiceOptions {
  initial?: ImageChoice;
  allowKeep?: boolean;
}

export function useImageChoice({ initial, allowKeep = false }: UseImageChoiceOptions = {}) {
  const [choice, setChoice] = useState<ImageChoice>(
    initial ?? { kind: "default", id: DEFAULT_IMAGES[0].id },
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (choice.kind !== "upload") return;
    const url = choice.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [choice]);

  function chooseDefault(id: string) {
    requestRef.current++;
    setProcessing(false);
    setError(null);
    setChoice({ kind: "default", id });
  }

  function keepCurrent(image: { url: string; width: number; height: number; title?: string }) {
    if (!allowKeep) return;
    requestRef.current++;
    setProcessing(false);
    setError(null);
    setChoice({
      kind: "keep",
      url: image.url,
      width: image.width,
      height: image.height,
      title: image.title,
    });
  }

  async function chooseFile(file: File) {
    const invalid = validateImageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    const requestId = ++requestRef.current;
    setError(null);
    setProcessing(true);
    try {
      const prepared = await preparePuzzleImage(file);
      if (!mountedRef.current || requestId !== requestRef.current) {
        URL.revokeObjectURL(prepared.previewUrl);
        return;
      }
      setChoice({
        kind: "upload",
        file: prepared.file,
        width: prepared.width,
        height: prepared.height,
        previewUrl: prepared.previewUrl,
        name: file.name,
      });
    } catch (caught) {
      if (mountedRef.current && requestId === requestRef.current) {
        setError(caught instanceof Error ? caught.message : "That photo could not be prepared.");
      }
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setProcessing(false);
    }
  }

  const defaultImage = choice.kind === "default" ? defaultImageById(choice.id) : undefined;
  const imageUrl =
    choice.kind === "upload"
      ? choice.previewUrl
      : choice.kind === "keep"
        ? choice.url
        : (defaultImage?.url ?? DEFAULT_IMAGES[0].url);
  const width =
    choice.kind === "upload"
      ? choice.width
      : choice.kind === "keep"
        ? choice.width
        : (defaultImage?.width ?? DEFAULT_IMAGES[0].width);
  const height =
    choice.kind === "upload"
      ? choice.height
      : choice.kind === "keep"
        ? choice.height
        : (defaultImage?.height ?? DEFAULT_IMAGES[0].height);
  const title =
    choice.kind === "keep"
      ? (choice.title ?? "Your photo")
      : (defaultImage?.title ?? "Your photo");

  function appendTo(form: FormData) {
    if (choice.kind === "default") {
      form.append("imageKind", "default");
      form.append("defaultImageId", choice.id);
    } else if (choice.kind === "upload") {
      form.append("imageKind", "upload");
      form.append("image", choice.file, "puzzle-photo.jpg");
    } else {
      form.append("imageKind", "keep");
    }
  }

  return {
    choice,
    imageUrl,
    width,
    height,
    aspect: width / height,
    title,
    processing,
    error,
    chooseDefault,
    chooseFile,
    keepCurrent,
    appendTo,
    clearError: () => setError(null),
  };
}

export type ImageChoiceController = ReturnType<typeof useImageChoice>;
