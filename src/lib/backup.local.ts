/**
 * Local-disk database backups — standalone deployment overlay.
 *
 * Drop-in replacement for `backup.ts`, swapped in ONLY by the standalone build
 * (see scripts/build-standalone.mjs). Instead of streaming backups to Replit
 * Object Storage, it writes gzipped pg_dump output to a local folder (BACKUP_DIR,
 * default <cwd>/backups) and restores with psql. Preserves the same exports:
 *   runBackup, listBackups, restoreBackup, getBackupStream, BackupMeta.
 *
 * Requires the PostgreSQL client tools (pg_dump / psql) to be available on the
 * host PATH. They connect to the managed PostgreSQL via DATABASE_URL.
 */
import { spawn } from "child_process";
import { createGzip, createGunzip } from "zlib";
import { createReadStream, createWriteStream } from "fs";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { logger } from "./logger";

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(process.cwd(), "backups");
const RETENTION_DAYS = 14;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function backupFilename(): string {
  const now = new Date();
  return (
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}.sql.gz`
  );
}

function sanitize(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, "");
}

export interface BackupMeta {
  filename: string;
  size: number;
  createdAt: string;
}

export async function runBackup(): Promise<BackupMeta> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const filename = backupFilename();
  const absPath = path.join(BACKUP_DIR, filename);
  logger.info({ filename }, "Starting database backup");

  const writeStream = createWriteStream(absPath);
  const gzip = createGzip();

  // --clean --if-exists makes the dump self-contained: restoring it drops and
  // recreates each object, so a restore over an existing database is idempotent.
  const dump = spawn(
    "pg_dump",
    ["--no-password", "--format=plain", "--clean", "--if-exists", process.env.DATABASE_URL],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let stderrBuf = "";
  dump.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });

  dump.stdout.pipe(gzip).pipe(writeStream);

  const dumpExited = new Promise<void>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}: ${stderrBuf.trim()}`));
    });
  });

  const writeFinished = new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  try {
    await Promise.all([dumpExited, writeFinished]);
  } catch (err) {
    try {
      await fsp.rm(absPath, { force: true });
      logger.warn({ filename }, "Deleted partial backup file after failure");
    } catch (cleanupErr) {
      logger.warn({ cleanupErr, filename }, "Failed to clean up partial backup file");
    }
    throw err;
  }

  if (stderrBuf) logger.warn({ stderr: stderrBuf }, "pg_dump warnings");

  const stat = await fsp.stat(absPath);
  logger.info({ filename, size: stat.size }, "Backup complete");

  await pruneOldBackups();

  return { filename, size: stat.size, createdAt: stat.mtime.toISOString() };
}

async function pruneOldBackups(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(BACKUP_DIR);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith(".sql.gz")) continue;
    try {
      const abs = path.join(BACKUP_DIR, name);
      const stat = await fsp.stat(abs);
      if (stat.mtime.getTime() < cutoff) {
        await fsp.rm(abs, { force: true });
        logger.info({ file: name }, "Pruned old backup");
      }
    } catch (err) {
      logger.warn({ err, file: name }, "Failed to prune backup");
    }
  }
}

export async function listBackups(): Promise<BackupMeta[]> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(BACKUP_DIR);
  } catch {
    return [];
  }
  const metas = await Promise.all(
    entries
      .filter((name) => name.endsWith(".sql.gz"))
      .map(async (name) => {
        const stat = await fsp.stat(path.join(BACKUP_DIR, name));
        return { filename: name, size: stat.size, createdAt: stat.mtime.toISOString() };
      }),
  );
  return metas.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Restore the database from a stored backup. DESTRUCTIVE: the dump was created
 * with --clean --if-exists, so this drops and recreates every object, replacing
 * all current data with the backup's contents.
 */
export async function restoreBackup(filename: string): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const safe = sanitize(filename);
  const absPath = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(absPath)) throw new Error(`Backup not found: ${safe}`);

  logger.warn({ filename: safe }, "Starting database RESTORE — existing data will be replaced");

  const gunzip = createGunzip();
  const psql = spawn(
    "psql",
    ["--no-password", "--set", "ON_ERROR_STOP=on", process.env.DATABASE_URL],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  let stderrBuf = "";
  psql.stderr.on("data", (d: Buffer) => { stderrBuf += d.toString(); });
  psql.stdout.on("data", () => { /* drain stdout */ });

  const readStream = createReadStream(absPath);
  readStream.pipe(gunzip).pipe(psql.stdin);

  const readFailed = new Promise<void>((_resolve, reject) => {
    readStream.on("error", reject);
    gunzip.on("error", reject);
  });

  const psqlExited = new Promise<void>((resolve, reject) => {
    psql.on("error", reject);
    psql.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited with code ${code}: ${stderrBuf.trim().slice(-2000)}`));
    });
  });

  await Promise.race([psqlExited, readFailed]);
  await psqlExited;
  logger.info({ filename: safe }, "Database restore complete");
}

export async function getBackupStream(filename: string): Promise<NodeJS.ReadableStream> {
  const safe = sanitize(filename);
  const absPath = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(absPath)) throw new Error(`Backup not found: ${safe}`);
  return createReadStream(absPath);
}
