import type { Request } from "express";
import { db, loginHistoryTable } from "@workspace/db";

/** Best-effort client IP, honouring the proxy's X-Forwarded-For header. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** Record a single login attempt. Never throws — logging must not block auth. */
export async function recordLogin(
  req: Request,
  args: { userId?: number | null; email: string; success: boolean; reason?: string }
): Promise<void> {
  try {
    await db.insert(loginHistoryTable).values({
      userId: args.userId ?? null,
      email: args.email,
      success: args.success,
      reason: args.reason ?? null,
      ipAddress: clientIp(req),
      userAgent: (req.headers["user-agent"] as string) ?? null,
    });
  } catch {
    // swallow — a history write failure should never break sign-in
  }
}
