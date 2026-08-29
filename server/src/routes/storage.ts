import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import multer, { MulterError } from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { localObjectStorageEnabled, saveLocalUpload, serveLocalObject } from "../lib/local-object-storage";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_CONTENT_TYPE_PREFIXES = ["image/", "video/"];

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix)
  );
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedContentType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Only image and video files are allowed."));
    }
  },
});

// Server-proxied upload: multer enforces size and MIME type limits before
// the file reaches GCS, so constraints cannot be bypassed by a cooperative client.
router.post(
  "/storage/uploads",
  requireAuth,
  requireRole("brand"),
  (req: Request, res: Response, next: (err?: unknown) => void) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large. Maximum upload size is 100 MB." });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    });
  },
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded." });
      return;
    }

    try {
      if (localObjectStorageEnabled()) {
        const objectPath = saveLocalUpload(req.file.buffer, req.file.mimetype);
        res.json({ objectPath });
        return;
      }

      const objectPath = await objectStorageService.uploadObjectBuffer(
        req.file.buffer,
        req.file.mimetype
      );
      res.json({ objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading object to storage");
      res.status(500).json({ error: "Failed to store uploaded file" });
    }
  }
);

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

// Serve uploaded ad assets publicly so <img>/<video> tags can render them
// without Authorization headers. UUID-based paths provide obscurity.
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    if (localObjectStorageEnabled()) {
      const local = serveLocalObject(objectPath);
      if (!local) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      res.setHeader("Content-Type", local.contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (local.size > 0) res.setHeader("Content-Length", String(local.size));
      local.stream.pipe(res);
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
