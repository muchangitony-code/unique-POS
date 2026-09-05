import { spawn } from "child_process";
import { createGzip, createGunzip } from "zlib";
import { objectStorageClient } from "./objectStorage";
import { logger } from "./logger";

const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
const BACKUP_PREFIX = "backups/";
const RETENTION_DAYS = 14;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function backupFilename(): string {
  const now = new Date();
  return (
    `${BACKUP_PREFIX}` +
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}.sql.gz`
  );
}

export interface BackupMeta {
  filename: string;
  size: number;
  createdAt: string;
}

export async function runBackup(): Promise<BackupMeta> {
  if (!BUCKET_ID) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const filename = backupFilename();
  logger.info({ filename }, "Starting database backup");

  const bucket = objectStorageClient.bucket(BUCKET_ID);
  const file = bucket.file(filename);

  const writeStream = file.createWriteStream({
    contentType: "application/gzip",
    metadata: {
      contentDisposition: `attachment; filename="${filename.replace(BACKUP_PREFIX, "")}"`,
    },
  });
  const gzip = createGzip();

  // --clean --if-exists makes the dump self-contained: restoring it drops and
  // recreates each object, so a restore over an existing database is idempotent.
  const dump = spawn(
    "pg_dump",
    ["--no-password", "--format=plain", "--clean", "--if-exists", process.env.DATABASE_URL],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let stderrBuf = "";
  dump.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });

  // Wire the pipeline BEFORE awaiting so events aren't missed
  dump.stdout.pipe(gzip).pipe(writeStream);

  // Await BOTH conditions so neither can silently succeed while the other fails.
  // Promise.all rejects immediately if either rejects; the first rejection wins.
  const dumpExited = new Promise<void>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}: ${stderrBuf.trim()}`));
    });
  });

  const uploadFinished = new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  try {
    await Promise.all([dumpExited, uploadFinished]);
  } catch (err) {
    // Clean up any partial object so it never appears in the backup list
    try {
      await file.delete({ ignoreNotFound: true });
      logger.warn({ filename }, "Deleted partial backup object after failure");
    } catch (cleanupErr) {
      logger.warn({ cleanupErr, filename }, "Failed to clean up partial backup object");
    }
    throw err;
  }

  if (stderrBuf) logger.warn({ stderr: stderrBuf }, "pg_dump warnings");

  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  const createdAt = (meta.timeCreated as string) ?? new Date().toISOString();

  logger.info({ filename, size }, "Backup complete");

  // Prune backups older than RETENTION_DAYS
  await pruneOldBackups();

  return { filename: filename.replace(BACKUP_PREFIX, ""), size, createdAt };
}

async function pruneOldBackups(): Promise<void> {
  const bucket = objectStorageClient.bucket(BUCKET_ID);
  const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of files) {
    try {
      const [meta] = await file.getMetadata();
      const created = new Date(meta.timeCreated as string).getTime();
      if (created < cutoff) {
        await file.delete();
        logger.info({ file: file.name }, "Pruned old backup");
      }
    } catch (err) {
      logger.warn({ err, file: file.name }, "Failed to prune backup");
    }
  }
}

export async function listBackups(): Promise<BackupMeta[]> {
  if (!BUCKET_ID) return [];
  const bucket = objectStorageClient.bucket(BUCKET_ID);
  const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });

  const metas = await Promise.all(
    files.map(async (file) => {
      const [meta] = await file.getMetadata();
      return {
        filename: file.name.replace(BACKUP_PREFIX, ""),
        size: Number(meta.size ?? 0),
        createdAt: (meta.timeCreated as string) ?? "",
      };
    })
  );

  return metas.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Restore the database from a stored backup. DESTRUCTIVE: the dump was created
 * with --clean --if-exists, so this drops and recreates every object, replacing
 * all current data with the backup's contents. Callers must gate this behind a
 * super-admin check and an explicit confirmation.
 */
export async function restoreBackup(filename: string): Promise<void> {
  if (!BUCKET_ID) throw new Error("Object storage not configured");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const bucket = objectStorageClient.bucket(BUCKET_ID);
  const file = bucket.file(`${BACKUP_PREFIX}${safe}`);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Backup not found: ${safe}`);

  logger.warn({ filename: safe }, "Starting database RESTORE — existing data will be replaced");

  const gunzip = createGunzip();
  // ON_ERROR_STOP=on so ANY SQL error aborts the restore with a non-zero exit —
  // a destructive recovery path must never report success on a partial failure.
  // Safe because dumps are written with `pg_dump --clean --if-exists`, so the
  // leading DROPs no longer produce spurious "does not exist" errors.
  const psql = spawn(
    "psql",
    ["--no-password", "--set", "ON_ERROR_STOP=on", process.env.DATABASE_URL],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  let stderrBuf = "";
  psql.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });
  psql.stdout.on("data", () => { /* drain stdout */ });

  const readStream = file.createReadStream();
  readStream.pipe(gunzip).pipe(psql.stdin);

  const readFailed = new Promise<void>((_resolve, reject) => {
    readStream.on("error", reject);
    gunzip.on("error", reject);
  });

  const psqlExited = new Promise<void>((resolve, reject) => {
    psql.on("error", reject);
    psql.on("close", (code) => {
      // With ON_ERROR_STOP=on, a non-zero exit means at least one statement failed.
      if (code === 0) resolve();
      else reject(new Error(`psql exited with code ${code}: ${stderrBuf.trim().slice(-2000)}`));
    });
  });

  await Promise.race([psqlExited, readFailed]);
  await psqlExited;
  logger.info({ filename: safe }, "Database restore complete");
}

export async function getBackupStream(filename: string): Promise<NodeJS.ReadableStream> {
  if (!BUCKET_ID) throw new Error("Object storage not configured");
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const bucket = objectStorageClient.bucket(BUCKET_ID);
  const file = bucket.file(`${BACKUP_PREFIX}${safe}`);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`Backup not found: ${safe}`);
  return file.createReadStream();
}
