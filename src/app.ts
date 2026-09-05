import path from "path";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./lib/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// The frontend API client generates URLs that already include the /api prefix
// (from the OpenAPI spec servers.url = /api), and setBaseUrl('/api') in
// AuthContext prepends another /api, producing /api/api/auth/login.
// This middleware rewrites /api/api/… → /api/… so routing stays correct
// without requiring any frontend changes.
app.use((req: Request, _res: Response, next: NextFunction): void => {
  // Rewrite /api/api[/…] → /api[/…] only on an exact path-segment boundary.
  // Guards against false positives like /api/apiary or /api/apix.
  if (req.url === "/api/api" || req.url.startsWith("/api/api/") || req.url.startsWith("/api/api?")) {
    req.url = req.url.slice("/api".length);
  }
  next();
});

// Standalone deployment: serve the built frontend from disk. Guarded by
// SERVE_CLIENT_DIR so this is a no-op on Replit (where Vite serves the client
// separately). Static assets and the SPA fallback are handled BEFORE auth so
// the app shell and its assets load without a token; API calls (under /api) fall
// through to the authenticated router below.
const clientDir = process.env.SERVE_CLIENT_DIR;
if (clientDir) {
  const absClientDir = path.resolve(clientDir);
  app.use(express.static(absClientDir));
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(absClientDir, "index.html"));
  });
}

// Public routes: auth endpoints and health check. Matched by path prefix for
// ALL methods.
const PUBLIC_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/health", "/api/storage/objects", "/api/storage/public-objects", "/api/storage/upload/"];

// Read-only public routes: only GET is public. Any other method (e.g. PATCH to
// update branding) must go through auth so per-route guards like
// requireSuperAdmin can populate and check req.user. Without this the write
// route would be treated as public and req.user would never be set.
const PUBLIC_GET_PATHS = ["/api/settings/branding"];

function conditionalAuth(req: Request, res: Response, next: NextFunction): void {
  const isPublic =
    PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p)) ||
    (req.method === "GET" && PUBLIC_GET_PATHS.includes(req.path));
  if (isPublic) {
    next();
  } else {
    requireAuth(req, res, next);
  }
}

app.use(conditionalAuth);
app.use("/api", router);

// Global error handler: maps thrown errors carrying a `status`/`statusCode`
// (e.g. BranchScopeError) to that HTTP code; everything else is a 500.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const e = err as { status?: number; statusCode?: number; message?: string };
  const status = e?.status ?? e?.statusCode ?? 500;
  if (status >= 500) logger.error({ err }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(status).json({ error: e?.message ?? "Internal server error" });
});

export default app;
