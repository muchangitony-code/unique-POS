/**
 * Local-disk object storage — standalone deployment overlay.
 *
 * This module is a drop-in replacement for `objectStorage.ts`, swapped in ONLY
 * by the standalone build (see scripts/build-standalone.mjs). It stores uploaded
 * branding assets on the local filesystem instead of Replit Object Storage, so
 * the app runs on ordinary Node.js hosting (cPanel/Truehost) with no Replit
 * sidecar. It preserves the exact public API surface the callers rely on:
 *   - ObjectStorageService.getObjectEntityUploadURL()
 *   - ObjectStorageService.normalizeObjectEntityPath()
 *   - ObjectStorageService.getObjectEntityFile()
 *   - ObjectStorageService.downloadObject()
 *   - ObjectNotFoundError
 *   - saveUploadObject() (used by the local PUT upload route)
 *
 * The stored object-path format ("/objects/uploads/<id>") is identical to the
 * Replit implementation, so the database, frontend and serving route behave the
 * same.
 */
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { Readable } from "stream";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

// Root directory for locally stored uploads. Configurable via LOCAL_STORAGE_DIR;
// defaults to <cwd>/storage. Branding images live under <root>/uploads/.
const STORAGE_ROOT = process.env.LOCAL_STORAGE_DIR
  ? path.resolve(process.env.LOCAL_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage");

function uploadsDir(): string {
  return path.join(STORAGE_ROOT, "uploads");
}

// Upload tokens are short-lived HMAC signatures over (objectId, expiry) keyed by
// SESSION_SECRET. Only an authenticated request (which mints the upload URL) can
// produce a valid token, so the public PUT route cannot be used to overwrite
// arbitrary objects. Mirrors the security intent of a presigned upload URL.
const UPLOAD_TTL_MS = 15 * 60 * 1000;

function uploadSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is required for upload signing");
  return s;
}

function signUpload(objectId: string, exp: string): string {
  return createHmac("sha256", uploadSecret()).update(`${objectId}.${exp}`).digest("hex");
}

/** Validate an upload token minted by getObjectEntityUploadURL(). */
export function verifyUploadToken(objectId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!objectId || !exp || !sig) return false;
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  const expected = signUpload(objectId, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Minimal File-like wrapper over a local file, exposing the subset of the
 * @google-cloud/storage File API that callers use (`download`, `createReadStream`).
 */
export class LocalFile {
  constructor(
    public readonly absPath: string,
    public readonly contentType: string = "application/octet-stream",
  ) {}

  async download(): Promise<[Buffer]> {
    return [await fsp.readFile(this.absPath)];
  }

  createReadStream(): Readable {
    return fs.createReadStream(this.absPath);
  }
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Returns a relative URL the browser PUTs the file bytes to. The matching
   * handler is `PUT /storage/upload/:id` (routes/storage.local.ts).
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const exp = String(Date.now() + UPLOAD_TTL_MS);
    const sig = signUpload(objectId, exp);
    return `/api/storage/upload/${objectId}?exp=${exp}&sig=${sig}`;
  }

  /** Convert an upload URL into the stored object path saved in the database. */
  normalizeObjectEntityPath(rawPath: string): string {
    const m = rawPath.match(/\/storage\/upload\/([A-Za-z0-9._-]+)(?:[?#]|$)/);
    if (m) return `/objects/uploads/${m[1]}`;
    return rawPath;
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const rel = objectPath.slice("/objects/".length);
    if (!rel || rel.includes("..")) throw new ObjectNotFoundError();
    const abs = path.join(STORAGE_ROOT, rel);
    if (!fs.existsSync(abs)) throw new ObjectNotFoundError();
    const ext = path.extname(abs).toLowerCase();
    return new LocalFile(abs, CONTENT_TYPES[ext] ?? "application/octet-stream");
  }

  async downloadObject(file: LocalFile, cacheTtlSec = 3600): Promise<Response> {
    const stat = await fsp.stat(file.absPath);
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    const headers: Record<string, string> = {
      "Content-Type": file.contentType,
      "Cache-Control": `public, max-age=${cacheTtlSec}`,
      "Content-Length": String(stat.size),
    };
    return new Response(webStream, { headers });
  }
}

/**
 * Persist an uploaded object to local disk. Called by the local PUT upload
 * route. Returns the stored object path ("/objects/uploads/<id>").
 */
export async function saveUploadObject(objectId: string, data: Buffer): Promise<string> {
  const safe = objectId.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safe) throw new Error("Invalid object id");
  await fsp.mkdir(uploadsDir(), { recursive: true });
  await fsp.writeFile(path.join(uploadsDir(), safe), data);
  return `/objects/uploads/${safe}`;
}
