/**
 * Disk-backed object storage when GCS / Replit Object Storage is not configured.
 * Enables brand video/image upload + reviewer playback in local dev and audit mock mode.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const UPLOAD_ROOT = process.env.LOCAL_UPLOAD_DIR
  ? path.resolve(process.env.LOCAL_UPLOAD_DIR)
  : path.resolve(process.cwd(), ".data/uploads");

export function localObjectStorageEnabled(): boolean {
  if (process.env.LOCAL_OBJECT_STORAGE === "0") return false;
  if (process.env.LOCAL_OBJECT_STORAGE === "1") return true;
  // Default: use local disk when cloud private dir is not configured.
  return !process.env.PRIVATE_OBJECT_DIR?.trim();
}

function ensureUploadDir() {
  mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function metaPath(objectId: string) {
  return path.join(UPLOAD_ROOT, `${objectId}.meta.json`);
}

function dataPath(objectId: string) {
  return path.join(UPLOAD_ROOT, objectId);
}

/** Persist buffer; returns API object path e.g. /objects/uploads/<uuid> */
export function saveLocalUpload(buffer: Buffer, contentType: string): string {
  ensureUploadDir();
  const objectId = randomUUID();
  const ext = extensionForContentType(contentType);
  const filename = `${objectId}${ext}`;
  writeFileSync(dataPath(filename), buffer);
  writeFileSync(metaPath(filename), JSON.stringify({ contentType, size: buffer.length }));
  return `/objects/uploads/${filename}`;
}

export function serveLocalObject(
  objectPath: string,
): { stream: ReturnType<typeof createReadStream>; contentType: string; size: number } | null {
  if (!objectPath.startsWith("/objects/")) return null;
  const relative = objectPath.slice("/objects/".length);
  const filePath = dataPath(relative);
  if (!existsSync(filePath)) return null;

  let contentType = "application/octet-stream";
  let size = 0;
  const metaFile = metaPath(relative);
  if (existsSync(metaFile)) {
    try {
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as { contentType?: string; size?: number };
      if (meta.contentType) contentType = meta.contentType;
      if (meta.size) size = meta.size;
    } catch {
      /* ignore corrupt meta */
    }
  }

  return { stream: createReadStream(filePath), contentType, size };
}

function extensionForContentType(contentType: string): string {
  if (contentType.startsWith("video/")) {
    if (contentType.includes("webm")) return ".webm";
    if (contentType.includes("quicktime")) return ".mov";
    return ".mp4";
  }
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.startsWith("image/")) return ".jpg";
  return ".bin";
}
