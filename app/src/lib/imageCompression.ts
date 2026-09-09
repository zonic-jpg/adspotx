/**
 * Client-side creative compression, run before an ad creative is uploaded.
 *
 * Brands could previously upload raw files up to 100MB with zero
 * compression anywhere in the pipeline (client or server). This does
 * canvas-based image compression before the file leaves the browser:
 * resize to a sane max dimension (1920px longest side) and re-encode to
 * JPEG at ~0.8 quality (PNGs are re-encoded as PNG to preserve
 * transparency). Orientation is handled via `createImageBitmap`'s
 * `imageOrientation: "from-image"` option where supported, so a
 * portrait phone photo doesn't come out sideways.
 *
 * Video compression is intentionally out of scope: real client-side video
 * transcoding needs a WASM encoder (e.g. ffmpeg.wasm) or MediaRecorder
 * re-encoding, both heavy and inconsistent enough across browsers that
 * they belong in a future server-side pipeline step, not a synchronous
 * pre-upload hook. Video files are passed through unchanged.
 *
 * This must never throw and never block an upload — any failure (decode
 * error, canvas unsupported, SSR, etc.) falls back to the original file.
 */

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;
/** Skip re-encoding files this small — the savings aren't worth a
 *  generation of quality loss. */
const MIN_SIZE_TO_COMPRESS = 300 * 1024; // 300KB

export interface CompressImageResult {
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

function passthrough(file: File): CompressImageResult {
  return { file, compressed: false, originalSize: file.size, finalSize: file.size };
}

function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = width >= height ? max / width : max / height;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function loadOrientedBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  // Preferred path: createImageBitmap normalizes EXIF orientation for us.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // fall through to <img> based decoding below
      }
    }
  }

  // Fallback for browsers without createImageBitmap: decode via <img>.
  // Most current browsers already auto-rotate per EXIF when painting an
  // <img>/canvas, so this is a reasonable (if not guaranteed) fallback.
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

function renameForType(name: string, type: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return type === "image/png" ? `${base}.png` : `${base}.jpg`;
}

/**
 * Compress an image File for upload. Non-image files (including video) are
 * returned untouched. Never throws.
 */
export async function compressImageFile(file: File): Promise<CompressImageResult> {
  try {
    if (!file.type.startsWith("image/")) return passthrough(file);
    // SVG is vector/text — canvas re-encoding would rasterize it for no gain.
    if (file.type === "image/svg+xml") return passthrough(file);
    if (file.size <= MIN_SIZE_TO_COMPRESS) return passthrough(file);
    if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") return passthrough(file);

    const source = await loadOrientedBitmap(file);
    if (!source) return passthrough(file);

    const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
    const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) return passthrough(file);

    const { width, height } = fitWithinMax(sourceWidth, sourceHeight, MAX_DIMENSION);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough(file);
    ctx.drawImage(source, 0, 0, width, height);
    if ("close" in source) source.close();

    // Keep PNG lossless (preserves transparency); everything else -> JPEG.
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, outputType, JPEG_QUALITY);
    if (!blob || blob.size <= 0) return passthrough(file);

    // Only use the compressed version if it actually saved space.
    if (blob.size >= file.size) return passthrough(file);

    const compressedFile = new File([blob], renameForType(file.name, outputType), {
      type: outputType,
      lastModified: Date.now(),
    });
    return { file: compressedFile, compressed: true, originalSize: file.size, finalSize: compressedFile.size };
  } catch {
    return passthrough(file);
  }
}
