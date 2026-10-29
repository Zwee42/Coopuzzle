const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 2400;
const TARGET_BYTES = 10 * 1024 * 1024;

export interface PreparedImage {
  file: File;
  width: number;
  height: number;
  previewUrl: string;
}

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) return "Please choose a JPEG, PNG or WebP photo.";
  if (file.size > MAX_INPUT_BYTES) return "That photo is larger than 25 MB. Please choose a smaller one.";
  return null;
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("That photo could not be opened. Try a different file.");
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The photo could not be prepared."));
      },
      "image/jpeg",
      quality,
    );
  });
}

export async function preparePuzzleImage(file: File): Promise<PreparedImage> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const decoded = await decodeImage(file);
  try {
    if (decoded.width < 80 || decoded.height < 80) {
      throw new Error("That photo is too small to make a puzzle from.");
    }
    const canvas = document.createElement("canvas");
    let quality = 0.9;
    let blob: Blob;

    do {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare the photo.");
      context.fillStyle = "#f7f0e5";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size > TARGET_BYTES) quality = Math.max(0.68, quality - 0.08);
    } while (blob.size > TARGET_BYTES && quality > 0.68);

    if (blob.size > 12 * 1024 * 1024) {
      throw new Error("That photo is still too large after resizing. Please choose a smaller one.");
    }

    const prepared = new File([blob], "puzzle-photo.jpg", { type: "image/jpeg" });
    return {
      file: prepared,
      width: canvas.width,
      height: canvas.height,
      previewUrl: URL.createObjectURL(prepared),
    };
  } finally {
    decoded.dispose();
  }
}
