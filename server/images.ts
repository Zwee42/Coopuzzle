import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageSize } from "image-size";
import type { RoomImage } from "../shared/protocol";
import { newId } from "./session";

const MIME_TYPES: Record<string, { extension: "jpg" | "png" | "webp"; detected: string[] }> = {
  "image/jpeg": { extension: "jpg", detected: ["jpg", "jpeg"] },
  "image/png": { extension: "png", detected: ["png"] },
  "image/webp": { extension: "webp", detected: ["webp"] },
};

export class InvalidImageError extends Error {
  readonly code = "invalid_image";
}

export interface StoredUpload {
  image: RoomImage;
  filename: string;
}

export function isAllowedImageMime(mime: string): boolean {
  return Object.hasOwn(MIME_TYPES, mime);
}

export async function storeImageUpload(
  buffer: Buffer,
  mime: string,
  uploadsDir: string,
): Promise<StoredUpload> {
  const allowed = MIME_TYPES[mime];
  if (!allowed) throw new InvalidImageError("Please use a JPEG, PNG or WebP image.");

  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw new InvalidImageError("That file does not look like a readable image.");
  }

  const type = dimensions.type?.toLowerCase();
  if (!type || !allowed.detected.includes(type)) {
    throw new InvalidImageError("The image contents do not match its file type.");
  }
  if (!dimensions.width || !dimensions.height) {
    throw new InvalidImageError("The image has no readable dimensions.");
  }
  if (dimensions.width > 12000 || dimensions.height > 12000) {
    throw new InvalidImageError("That image is too large. Please choose one under 12000 pixels per side.");
  }
  if (dimensions.width < 80 || dimensions.height < 80) {
    throw new InvalidImageError("That image is too small to make a puzzle from.");
  }

  await mkdir(uploadsDir, { recursive: true });
  const filename = `${newId()}.${allowed.extension}`;
  await writeFile(join(uploadsDir, filename), buffer, { flag: "wx" });

  return {
    filename,
    image: {
      kind: "upload",
      url: `/uploads/${filename}`,
      width: dimensions.width,
      height: dimensions.height,
    },
  };
}

export async function removeUpload(filename: string | null, uploadsDir: string): Promise<void> {
  if (!filename || !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename)) return;
  try {
    await unlink(join(uploadsDir, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not remove an uploaded image:", (error as Error).message);
    }
  }
}
