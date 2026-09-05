/**
 * Standalone deployment builder for UniquePOS.
 *
 * Produces a self-contained `deploy/` folder (and a zip) that runs on ordinary
 * Node.js hosting (cPanel / Truehost Passenger) with a plain `npm install` — no
 * pnpm workspaces, no `catalog:`/`workspace:*` deps, no Replit infrastructure.
 *
 * What it does:
 *   1. Bundles the API server with esbuild (inlines @workspace/* packages) and
 *      overlays the local-disk storage/backup modules so nothing depends on
 *      Replit Object Storage.
 *   2. Copies the pre-built frontend (artifacts/unique-pos/dist/public).
 *   3. Dumps the current PostgreSQL database to db/database.sql (schema + data)
 *      so the target managed PostgreSQL can be restored in one command.
 *   4. Emits a standalone package.json (real versions), an app.js startup file,
 *      .env.example, README and .gitignore.
 *   5. Zips the whole thing.
 *
 * Run:  node artifacts/api-server/build-standalone.mjs
 * (Build the frontend first: `PORT=3000 BASE_PATH=/ NODE_ENV=production \
 *   pnpm --filter @workspace/unique-pos build`)
 */
import { createRequire } from "node:module";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import AdmZip from "adm-zip";

const require = createRequire(import.meta.url);
globalThis.require = require;

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(artifactDir, "..", "..");
const frontendDist = path.resolve(repoRoot, "artifacts/unique-pos/dist/public");
const outDir = path.resolve(repoRoot, "deploy");
const serverDir = path.resolve(outDir, "server");
const zipPath = path.resolve(repoRoot, "uniquepos-standalone.zip");

// External packages that must NOT be bundled (native / dynamically-loaded).
// Mirrors artifacts/api-server/build.mjs; @google-cloud/* stays external but is
// no longer reachable once the local storage overlay drops objectAcl.
const EXTERNAL = [
  "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2",
  "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil", "utf-8-validate",
  "ssh2", "cpu-features", "dtrace-provider", "isolated-vm", "lightningcss",
  "pg-native", "oracledb", "mongodb-client-encryption", "nodemailer", "handlebars",
  "knex", "typeorm", "protobufjs", "onnxruntime-node", "@tensorflow/*",
  "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@aws-sdk/*", "@azure/*",
  "@opentelemetry/*", "@google-cloud/*", "@google/*", "googleapis", "firebase-admin",
  "@parcel/watcher", "@sentry/profiling-node", "@tree-sitter/*", "aws-sdk",
  "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis", "kerberos",
  "leveldown", "miniflare", "mysql2", "newrelic", "odbc", "piscina", "realm",
  "ref-napi", "rocksdb", "sass-embedded", "sequelize", "serialport", "snappy",
  "tinypool", "usb", "workerd", "wrangler", "zeromq", "zeromq-prebuilt",
  "playwright", "puppeteer", "puppeteer-core", "electron", "pdfkit", "fontkit",
  "linebreak", "unicode-trie", "unicode-properties", "dfa", "restructure",
  "tiny-inflate", "brotli",
];

// esbuild plugin: redirect objectStorage / backup / routes/storage to their
// local-disk (.local.ts) overlays for the standalone build only.
const overlayPlugin = {
  name: "standalone-overlay",
  setup(build) {
    build.onResolve({ filter: /(^|\/)(objectStorage|backup|storage)$/ }, (args) => {
      if (args.importer === "") return undefined;
      const abs = path.resolve(args.resolveDir, args.path);
      const base = path.basename(abs);
      let local = null;
      if (base === "objectStorage" || base === "backup") {
        local = `${abs}.local.ts`;
      } else if (base === "storage" && path.basename(path.dirname(abs)) === "routes") {
        local = `${abs}.local.ts`;
      }
      if (local && fs.existsSync(local)) return { path: local };
      return undefined;
    });
  },
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with code ${res.status}`);
  }
}

async function bundleServer() {
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(serverDir, { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    target: "node22",
    bundle: true,
    // CommonJS so cPanel/Passenger can load it via require() without hitting
    // ERR_REQUIRE_ASYNC_MODULE (which ESM + top-level await triggers).
    format: "cjs",
    outdir: serverDir,
    outExtension: { ".js": ".cjs" },
    logLevel: "info",
    external: EXTERNAL,
    sourcemap: "linked",
    plugins: [overlayPlugin, esbuildPluginPino({ transports: ["pino-pretty"] })],
    // Some bundled deps (e.g. node-cron) read `import.meta.url` at load time.
    // In CJS esbuild leaves it undefined, so map it to the bundle's own file URL.
    define: { "import.meta.url": "__importMetaUrl" },
    banner: {
      js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
    },
  });
}

// Scan the bundled output for bare (node_modules) imports that were left
// external, so the standalone package.json lists exactly what npm must install.
function collectRuntimeDeps() {
  const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
  const found = new Set();
  const re = /(?:from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  for (const file of fs.readdirSync(serverDir)) {
    if (!/\.(mjs|js|cjs)$/.test(file)) continue;
    const src = fs.readFileSync(path.join(serverDir, file), "utf8");
    let m;
    while ((m = re.exec(src)) !== null) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      if (spec.startsWith("node:")) continue;
      const parts = spec.split("/");
      const name = spec.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
      if (builtins.has(name)) continue;
      // Guard against false positives from string literals inside the bundle.
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) continue;
      found.add(name);
    }
  }
  // pdfkit + pino transports pull these in indirectly; ensure they're present.
  found.add("pino-pretty");
  found.add("thread-stream");
  const deps = {};
  for (const name of [...found].sort()) {
    const version = resolveInstalledVersion(name);
    if (version) deps[name] = `^${version}`;
    else console.warn(`  ! could not resolve version for ${name}`);
  }
  return deps;
}

function resolveInstalledVersion(name) {
  const candidates = [
    path.resolve(artifactDir, "node_modules", name, "package.json"),
    path.resolve(repoRoot, "node_modules", name, "package.json"),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")).version;
    } catch {
      /* try next */
    }
  }
  try {
    return JSON.parse(fs.readFileSync(require.resolve(`${name}/package.json`), "utf8")).version;
  } catch {
    return null;
  }
}

async function copyFrontend() {
  if (!fs.existsSync(frontendDist)) {
    throw new Error(
      `Frontend build not found at ${frontendDist}. Build it first:\n` +
        `  PORT=3000 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/unique-pos build`,
    );
  }
  await fsp.cp(frontendDist, path.resolve(outDir, "public"), { recursive: true });
}

async function dumpDatabase() {
  const dbDir = path.resolve(outDir, "db");
  await fsp.mkdir(dbDir, { recursive: true });
  if (!process.env.DATABASE_URL) {
    console.warn("  ! DATABASE_URL not set — skipping db/database.sql dump");
    return false;
  }
  const outFile = path.resolve(dbDir, "database.sql");
  const res = spawnSync(
    "pg_dump",
    ["--no-password", "--format=plain", "--clean", "--if-exists", "--no-owner", "--no-privileges", process.env.DATABASE_URL],
    { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    console.warn(`  ! pg_dump failed: ${res.stderr?.toString().slice(0, 500)}`);
    return false;
  }
  fs.writeFileSync(outFile, res.stdout);
  return true;
}

async function writeManifests(deps, hasDb) {
  const pkg = {
    name: "uniquepos",
    version: "1.0.0",
    private: true,
    // Intentionally CommonJS (no "type":"module") so cPanel/Passenger can load
    // app.js via require() without ERR_REQUIRE_ASYNC_MODULE.
    main: "app.js",
    engines: { node: ">=22" },
    scripts: { start: "node app.js" },
    dependencies: deps,
  };
  await fsp.writeFile(path.resolve(outDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // cPanel/Passenger startup file. CommonJS with NO top-level await, so Passenger
  // can load it with require(). Loads .env, sets on-disk defaults, then boots the
  // bundled (CommonJS) server which listens on process.env.PORT.
  const appJs = `// UniquePOS standalone entrypoint (cPanel / Passenger startup file).
// CommonJS by design — Passenger loads this via require(); an ESM module or any
// top-level await here would throw ERR_REQUIRE_ASYNC_MODULE.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// Load .env (simple KEY=VALUE parser; no external dependency).
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\\r?\\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// On-disk defaults (resolved next to this file).
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.SERVE_CLIENT_DIR = process.env.SERVE_CLIENT_DIR || path.join(__dirname, "public");
process.env.BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
process.env.LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "storage");

// Synchronous require — the bundled server is CommonJS and starts on import.
require("./server/index.cjs");
`;
  await fsp.writeFile(path.resolve(outDir, "app.js"), appJs);

  const envExample = `# ── Required ────────────────────────────────────────────────────────────────
# Connection string for your managed PostgreSQL (Neon / Supabase / Railway / etc.)
DATABASE_URL=postgres://user:password@host:5432/dbname

# Secret used to sign login tokens. Use a long random string.
SESSION_SECRET=change-me-to-a-long-random-string

# Port the app listens on. On cPanel/Passenger this is set automatically —
# leave it unset there. For a manual "npm start" run, set it (e.g. 3000).
# PORT=3000

# ── Optional ────────────────────────────────────────────────────────────────
# Public URL of the app, used for links in alert/backup emails.
# APP_URL=https://pos.yourdomain.com

# SMTP password for outgoing email (host/port/user are set in-app under Settings).
# SMTP_PASSWORD=

# Storage locations (default to folders beside app.js — usually fine as-is):
# SERVE_CLIENT_DIR=./public
# BACKUP_DIR=./backups
# LOCAL_STORAGE_DIR=./storage
`;
  await fsp.writeFile(path.resolve(outDir, ".env.example"), envExample);
  await fsp.writeFile(
    path.resolve(outDir, ".gitignore"),
    "node_modules/\n.env\nbackups/\nstorage/\n",
  );
  await fsp.writeFile(path.resolve(outDir, "README.md"), readme(hasDb));
  // Ensure runtime folders exist in the package.
  for (const d of ["backups", "storage"]) {
    const dir = path.resolve(outDir, d);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.resolve(dir, ".gitkeep"), "");
  }
}

function readme(hasDb) {
  return `# UniquePOS — Standalone Deployment

A self-contained build of UniquePOS (ERP + POS) for ordinary Node.js hosting
such as cPanel/Truehost. The Node app serves both the API and the web frontend.

## Requirements

- Node.js 22 (set in the cPanel "Setup Node.js App" tool).
- A PostgreSQL database. Your host offers MySQL only, so use a free/managed
  PostgreSQL such as Neon (neon.tech), Supabase or Railway and point
  \`DATABASE_URL\` at it.
- \`psql\` command-line tool to load the database (from your PC is fine).
- For in-app backup/restore to work on the server, \`pg_dump\`/\`psql\` must be on
  the server PATH. If they are not available, use your managed provider's own
  backups instead — the rest of the app works without them.

## 1. Create the database

Create an empty PostgreSQL database with your managed provider and copy its
connection string.

${
  hasDb
    ? `Load the included dump (schema + starter data, including the admin login):

\`\`\`bash
psql "YOUR_DATABASE_URL" -f db/database.sql
\`\`\`

Default login: \`admin@uniquepos.com\` / \`Test1234!\` — change this password
immediately after first sign-in (Settings → Users).`
    : `Load your schema into the database (no dump was bundled in this build).`
}

## 2. Configure environment

Copy \`.env.example\` to \`.env\` and fill in \`DATABASE_URL\` and \`SESSION_SECRET\`.
On cPanel you can instead set these as environment variables in the
"Setup Node.js App" screen.

## 3. Install & start

\`\`\`bash
npm install --omit=dev
npm start
\`\`\`

On cPanel: upload this folder, set the Application Root to it and the
Application Startup File to \`app.js\`, add the environment variables, then click
"Run NPM Install" followed by "Restart".

## Layout

- \`app.js\` — startup file (loads .env, boots the server).
- \`server/\` — bundled API + app logic (single file, no build step needed).
- \`public/\` — built web frontend, served by the Node app.
- \`db/database.sql\` — database dump to restore${hasDb ? "" : " (not present in this build)"}.
- \`backups/\` — local database backups created by the in-app backup feature.
- \`storage/\` — uploaded branding images (logo/stamp/signature).

## Notes

- All API routes are served under \`/api\`; the frontend is served from \`/\`.
- File uploads and backups are stored on local disk (see folders above). Make
  sure those folders are writable and included in your own off-site backups.
`;
}

async function makeZip() {
  await fsp.rm(zipPath, { force: true });
  const zip = new AdmZip();
  zip.addLocalFolder(outDir, "uniquepos");
  zip.writeZip(zipPath);
}

async function main() {
  console.log("▸ Bundling API server (with local-disk storage overlay)…");
  await bundleServer();

  console.log("▸ Copying frontend build…");
  await copyFrontend();

  console.log("▸ Dumping database…");
  const hasDb = await dumpDatabase();

  console.log("▸ Resolving standalone dependencies…");
  const deps = collectRuntimeDeps();
  console.log("  deps:", Object.keys(deps).join(", "));

  console.log("▸ Writing manifests…");
  await writeManifests(deps, hasDb);

  console.log("▸ Creating zip…");
  await makeZip();

  console.log(`\n✔ Done. Deployment folder: ${outDir}`);
  console.log(`✔ Zip: ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
