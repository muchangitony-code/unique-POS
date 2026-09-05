import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { requireSuperAdmin } from "../lib/permissions";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for uploading a branding image (logo / stamp /
 * signature). The client sends JSON metadata — NOT the file — then uploads the
 * file bytes directly to the returned presigned URL. Restricted to super
 * administrators so only owners can change company branding assets.
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
 * GET /storage/objects/*
 *
 * Serve uploaded branding assets. Branding images (logo/stamp/signature) must be
 * visible pre-authentication (login page, print windows), so this route is
 * public and streams the object without an ACL check.
 *
 * SECURITY: reads are locked to the `uploads/` prefix — the only location this
 * app writes user-uploaded branding images to (see getObjectEntityUploadURL).
 * This prevents the public route from ever serving anything else that may share
 * the object-storage bucket (e.g. database backups), even though those live
 * under different prefixes.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response): Promise<void> => {
  const raw = (req.params as Record<string, string | string[]>).path;
  const objectId = Array.isArray(raw) ? raw.join("/") : raw;
  // Only branding uploads are publicly readable.
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
