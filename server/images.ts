import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import type { RoomImage } from "../shared/protocol";
import { logger } from "./log";
import { newId } from "./session";

const FORMATS: Record<
  string,
  { format: "jpeg" | "png" | "webp"; extension: "jpg" | "png" | "webp" }
> = {
  "image/jpeg": { format: "jpeg", extension: "jpg" },
  "image/png": { format: "png", extension: "png" },
  "image/webp": { format: "webp", extension: "webp" },
};

const MAX_INPUT_DIMENSION = 12_000;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_DIMENSION = 2400;

export class InvalidImageError extends Error {
  readonly code = "invalid_image";
}

export interface StoredUpload {
  image: RoomImage;
  filename: string;
}

export function isAllowedImageMime(mime: string): boolean {
  return Object.hasOwn(FORMATS, mime);
}

function encodeOptions(format: "jpeg" | "png" | "webp") {
  if (format === "jpeg") return { quality: 86, mozjpeg: true };
  if (format === "webp") return { quality: 86, effort: 4 };
  return { compressionLevel: 9, palette: true };
}

/**
 * Validate, auto-orient, downscale and re-encode an upload. Re-encoding strips
 * EXIF/GPS/camera metadata and protects against malformed or huge files.
 */
export async function storeImageUpload(
  buffer: Buffer,
  mime: string,
  uploadsDir: string,
  options: { beforeWrite?: (bytes: number) => Promise<void> } = {},
): Promise<StoredUpload> {
  const allowed = FORMATS[mime];
  if (!allowed) throw new InvalidImageError("Please use a JPEG, PNG or WebP image.");

  let output: { data: Buffer; info: OutputInfo };
  try {
    const input = sharp(buffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await input.metadata();
    const format = metadata.format;
    if (!format || format !== allowed.format) {
      throw new InvalidImageError("The image contents do not match its file type.");
    }
    if (!metadata.width || !metadata.height) {
      throw new InvalidImageError("The image has no readable dimensions.");
    }
    if (metadata.pages && metadata.pages > 1) {
      throw new InvalidImageError("Animated images are not supported. Please choose a still photo.");
    }
    if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION) {
      throw new InvalidImageError(
        `That image is too large. Please choose one under ${MAX_INPUT_DIMENSION} pixels per side.`,
      );
    }
    if (metadata.width * metadata.height > MAX_INPUT_PIXELS) {
      throw new InvalidImageError("That image has too many pixels. Please choose a smaller photo.");
    }
    if (metadata.width < 80 || metadata.height < 80) {
      throw new InvalidImageError("That image is too small to make a puzzle from.");
    }

    let pipeline = input.rotate();
    if (metadata.width > MAX_OUTPUT_DIMENSION || metadata.height > MAX_OUTPUT_DIMENSION) {
      pipeline = pipeline.resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    output = await pipeline
      .toFormat(allowed.format, encodeOptions(allowed.format))
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError("That file does not look like a readable image.");
  }

  if (options.beforeWrite) await options.beforeWrite(output.data.byteLength);

  await mkdir(uploadsDir, { recursive: true });
  const filename = `${newId()}.${allowed.extension}`;
  await writeFile(join(uploadsDir, filename), output.data, { flag: "wx" });

  return {
    filename,
    image: {
      kind: "upload",
      url: `/uploads/${filename}`,
      width: output.info.width,
      height: output.info.height,
    },
  };
}

export async function removeUpload(filename: string | null, uploadsDir: string): Promise<void> {
  if (!filename || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename)) return;
  try {
    await unlink(join(uploadsDir, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn("upload_remove_failed", {
        filename,
        message: (error as Error).message,
      });
    }
  }
}
