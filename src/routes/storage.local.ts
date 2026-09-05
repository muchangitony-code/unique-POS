/**
 * Storage routes (local-disk variant) — standalone deployment overlay.
 *
 * Drop-in replacement for `routes/storage.ts`, swapped in ONLY by the standalone
 * build (see scripts/build-standalone.mjs). Identical to the original except it
 * adds a `PUT /storage/upload/:id` endpoint that receives the raw file bytes and
 * writes them to local disk — the local-hosting equivalent of a presigned upload
 * to object storage.
 */
import { Readable } from "stream";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { requireSuperAdmin } from "../lib/permissions";
import {
  ObjectNotFoundError,
  ObjectStorageService,
  saveUploadObject,
  verifyUploadToken,
} from "../lib/objectStorage.local";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request an upload target for a branding image (logo / stamp / signature). The
 * client sends JSON metadata — NOT the file — then PUTs the file bytes to the
 * returned URL. Restricted to super administrators.
 */
router.post(
  "/storage/uploads/request-url",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { name, size, content_type } = (req.body ?? {}) as {
      name?: unknown;
      size?: unknown;
      content_type?: unknown;
    };
    if (typeof name !== "string" || typeof size !== "number" || typeof content_type !== "string") {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ upload_url: uploadURL, object_path: objectPath });
    } catch (error) {
      req.log?.error?.({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * PUT /storage/upload/:id
 *
 * Receive the raw bytes of a branding image and store them on local disk. This
 * route is public (declared in PUBLIC_PATHS): it is guarded by the unguessable
 * random UUID minted by the authenticated request-url call above, and the id is
 * sanitized before use so nothing can be written outside the uploads folder.
 */
router.put(
  "/storage/upload/:id",
  express.raw({ type: () => true, limit: "6mb" }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const objectId = String((req.params as Record<string, string>).id);
      const exp = String((req.query.exp as string) ?? "");
      const sig = String((req.query.sig as string) ?? "");
      if (!verifyUploadToken(objectId, exp, sig)) {
        res.status(403).json({ error: "Invalid or expired upload token" });
        return;
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "Empty upload" });
        return;
      }
      await saveUploadObject(objectId, body);
      res.status(200).json({ ok: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Error saving uploaded object");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve uploaded branding assets. Public (login page / print windows need them).
 * Reads are locked to the `uploads/` prefix — the only place branding uploads
 * live — and reject any path traversal.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  const raw = (req.params as Record<string, string | string[]>).path;
  const objectId = Array.isArray(raw) ? raw.join("/") : raw;
  if (!objectId.startsWith("uploads/") || objectId.includes("..")) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(`/objects/${objectId}`);
    const response = await objectStorageService.downloadObject(objectFile, 3600);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    req.log?.error?.({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
