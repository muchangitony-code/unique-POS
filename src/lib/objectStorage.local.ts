/**
 * Local-disk object storage — standalone deployment overlay.
 */
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { Readable } from "stream";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

const STORAGE_ROOT = process.env.LOCAL_STORAGE_DIR
  ? path.resolve(process.env.LOCAL_STORAGE_DIR)
  : path.resolve(process.cwd(), "storage");

function uploadsDir(): string { return path.join(STORAGE_ROOT, "uploads"); }
const UPLOAD_TTL_MS = 15 * 60 * 1000;
function uploadSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is required for upload signing");
  return s;
}
function signUpload(objectId: string, exp: string): string {
  return createHmac("sha256", uploadSecret()).update(`${objectId}.${exp}`).digest("hex");
}

export function verifyUploadToken(objectId: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!objectId || !exp || !sig || !Number.isFinite(expNum) || Date.now() > expNum) return false;
  const expected = signUpload(objectId, exp);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export class ObjectNotFoundError extends Error {
  constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; Object.setPrototypeOf(this, ObjectNotFoundError.prototype); }
}

export class LocalFile {
  constructor(public readonly absPath: string, public readonly contentType: string = "application/octet-stream") {}
  async download(): Promise<[Buffer]> { return [await fsp.readFile(this.absPath)]; }
  createReadStream(): Readable { return fs.createReadStream(this.absPath); }
}

export class ObjectStorageService {
  constructor() {}

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const exp = String(Date.now() + UPLOAD_TTL_MS);
    return `/api/storage/upload/${objectId}?exp=${exp}&sig=${signUpload(objectId, exp)}`;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const m = rawPath.match(/\/storage\/upload\/([A-Za-z0-9._-]+)(?:[?#]|$)/);
    return m ? `/objects/uploads/${m[1]}` : rawPath;
  }

  /** Validate a persisted object reference before allowing branding to use it. */
  async objectExists(objectPath: string): Promise<boolean> {
    try { await this.getObjectEntityFile(objectPath); return true; } catch { return false; }
  }

  async getObjectEntityFile(objectPath: string): Promise<LocalFile> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const rel = objectPath.slice("/objects/".length);
    if (!rel || rel.includes("..")) throw new ObjectNotFoundError();
    const abs = path.join(STORAGE_ROOT, rel);
    if (!fs.existsSync(abs)) throw new ObjectNotFoundError();
    return new LocalFile(abs, CONTENT_TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream");
  }

  async downloadObject(file: LocalFile, cacheTtlSec = 3600): Promise<Response> {
    const stat = await fsp.stat(file.absPath);
    const webStream = Readable.toWeb(file.createReadStream()) as ReadableStream;
    return new Response(webStream, { headers: {
      "Content-Type": file.contentType,
      "Cache-Control": `public, max-age=${cacheTtlSec}`,
      "Content-Length": String(stat.size),
    }});
  }
}

export async function saveUploadObject(objectId: string, data: Buffer): Promise<string> {
  const safe = objectId.replace(/[^A-Za-z0-9._-]/g, "");
  if (!safe) throw new Error("Invalid object id");
  await fsp.mkdir(uploadsDir(), { recursive: true });
  await fsp.writeFile(path.join(uploadsDir(), safe), data);
  return `/objects/uploads/${safe}`;
}
