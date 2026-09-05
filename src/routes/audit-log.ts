import { Router, type IRouter } from "express";
import type { Request } from "express";
import { db, auditLogTable, businessSettingsTable } from "@workspace/db";
import { desc, sql, and, gte, lte, ilike, isNotNull } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { ObjectStorageService } from "../lib/objectStorage";
import { branchCondition } from "../lib/branch-scope";

const objectStorageService = new ObjectStorageService();

const router: IRouter = Router();

/** Build shared WHERE conditions from query params */
function buildConditions(req: Request) {
  const query = req.query as Record<string, string>;
  const { action = "", actor = "", entity = "", from = "", to = "", hasChanges = "" } = query;

  let fromDate: Date | undefined;
  let toDate:   Date | undefined;
  if (from) { fromDate = new Date(from); if (isNaN(fromDate.getTime())) fromDate = undefined; }
  if (to)   { toDate   = new Date(to);   if (isNaN(toDate.getTime()))   toDate   = undefined; }

  const conditions = [];
  if (action)     conditions.push(ilike(auditLogTable.action,     `%${action}%`));
  if (actor)      conditions.push(ilike(auditLogTable.actorName,  `%${actor}%`));
  if (entity)     conditions.push(ilike(auditLogTable.entityType, `%${entity}%`));
  if (fromDate)   conditions.push(gte(auditLogTable.createdAt,    fromDate));
  if (toDate)     conditions.push(lte(auditLogTable.createdAt,    toDate));
  // Filter to rows where metadata has both before and after keys (field-level diff)
  if (hasChanges === "1") {
    conditions.push(isNotNull(auditLogTable.metadata));
    conditions.push(sql`${auditLogTable.metadata}->>'before' IS NOT NULL`);
    conditions.push(sql`${auditLogTable.metadata}->>'after' IS NOT NULL`);
  }

  const bc = branchCondition(auditLogTable.branchId, req);
  if (bc) conditions.push(bc);

  return conditions.length ? and(...conditions) : undefined;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDiff(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  const before = m.before as Record<string, unknown> | undefined;
  const after  = m.after  as Record<string, unknown> | undefined;
  if (!before || !after) return "";

  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes = allKeys
    .filter(k => String(before[k] ?? "") !== String(after[k] ?? ""))
    .map(k => {
      const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const bv = before[k] == null ? "—" : String(before[k]);
      const av = after[k]  == null ? "—" : String(after[k]);
      return `${label}: ${bv} → ${av}`;
    });

  return changes.join("; ");
}

// GET /audit-log — paginated, filterable list (admin-only, enforced in index.ts)
router.get("/audit-log", async (req, res): Promise<void> => {
  const {
    page    = "1",
    limit   = "50",
    from    = "",
    to      = "",
  } = req.query as Record<string, string>;

  const rawPage  = parseInt(page, 10);
  const rawLimit = parseInt(limit, 10);
  const p = Number.isFinite(rawPage)  && rawPage  > 0 ? rawPage  : 1;
  const l = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, rawLimit) : 50;
  const offset = (p - 1) * l;

  // Validate optional date filters — return 400 if provided but invalid
  if (from && isNaN(new Date(from).getTime())) { res.status(400).json({ error: "Invalid 'from' date" }); return; }
  if (to   && isNaN(new Date(to).getTime()))   { res.status(400).json({ error: "Invalid 'to' date" });   return; }

  const where = buildConditions(req);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogTable)
    .where(where);

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(where)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(l)
    .offset(offset);

  res.json({
    data:       rows,
    total:      Number(total),
    page:       p,
    limit:      l,
    totalPages: Math.ceil(Number(total) / l),
  });
});

// GET /audit-log/actions — returns distinct action strings seen recently (for autocomplete)
router.get("/audit-log/actions", async (req, res): Promise<void> => {
  const bc = branchCondition(auditLogTable.branchId, req);
  const rows = await db
    .selectDistinct({ action: auditLogTable.action })
    .from(auditLogTable)
    .where(bc)
    .orderBy(auditLogTable.action)
    .limit(200);
  res.json(rows.map((r) => r.action));
});

// GET /audit-log/export — streams ALL matching rows as CSV (no pagination limit)
router.get("/audit-log/export", async (req, res): Promise<void> => {
  const { from = "", to = "" } = req.query as Record<string, string>;

  if (from && isNaN(new Date(from).getTime())) { res.status(400).json({ error: "Invalid 'from' date" }); return; }
  if (to   && isNaN(new Date(to).getTime()))   { res.status(400).json({ error: "Invalid 'to' date" });   return; }

  const where = buildConditions(req);

  // Count total matching rows so the frontend can show progress
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogTable)
    .where(where);

  const today = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${today}.csv"`);
  res.setHeader("X-Total-Rows", String(Number(total)));
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Rows");

  // Write BOM for Excel compatibility + header row
  res.write("\uFEFFTimestamp,Actor,Role,Action,Entity Type,Entity ID,Description,IP,Changes\n");

  // Stream in pages of 500 to keep memory bounded
  const PAGE_SIZE = 500;
  let offset = 0;

  while (true) {
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const chunk = rows.map(e => [
      csvEscape(e.createdAt ? new Date(e.createdAt).toISOString() : ""),
      csvEscape(e.actorName),
      csvEscape(e.actorRole),
      csvEscape(e.action),
      csvEscape(e.entityType),
      csvEscape(e.entityId),
      csvEscape(e.description),
      csvEscape(e.ipAddress),
      csvEscape(formatDiff(e.metadata)),
    ].join(",")).join("\n") + "\n";

    res.write(chunk);

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  res.end();
});

// GET /audit-log/export-pdf — generates a branded PDF compliance report for all matching rows
router.get("/audit-log/export-pdf", async (req, res): Promise<void> => {
  const { from = "", to = "" } = req.query as Record<string, string>;

  if (from && isNaN(new Date(from).getTime())) { res.status(400).json({ error: "Invalid 'from' date" }); return; }
  if (to   && isNaN(new Date(to).getTime()))   { res.status(400).json({ error: "Invalid 'to' date" });   return; }

  const where = buildConditions(req);

  // Fetch all matching rows (no pagination limit for export)
  const PAGE_SIZE = 500;
  const allRows: (typeof auditLogTable.$inferSelect)[] = [];
  let offset = 0;
  while (true) {
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(where)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset);
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Fetch business settings for branding
  const settings = await db.select().from(businessSettingsTable).limit(1);
  const biz = settings[0];
  const companyName  = biz?.businessName  ?? "UniquePOS";
  const companyPhone = biz?.businessPhone ?? "";
  const companyEmail = biz?.businessEmail ?? "";

  // Best-effort fetch of the logo for embedding in the PDF banner.
  let logoBuffer: Buffer | null = null;
  if (biz?.logoUrl && biz.logoUrl.startsWith("/objects/")) {
    try {
      const file = await objectStorageService.getObjectEntityFile(biz.logoUrl);
      const [buf] = await file.download();
      logoBuffer = buf;
    } catch {
      logoBuffer = null;
    }
  }

  // Build date range label
  const today = new Date().toISOString().slice(0, 10);
  const rangeLabel = (from || to)
    ? `${from || "beginning"} to ${to || today}`
    : `All records up to ${today}`;

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: "A4" });

  const today2 = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${today2}.pdf"`);
  doc.pipe(res);

  // ── Header ──────────────────────────────────────────────────────────────
  const hex6 = (v: string | null | undefined): string | null =>
    v && /^#?[0-9a-fA-F]{6}$/.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
  const DEEP_BLUE  = hex6(biz?.primaryColor) ?? "#0F2D5C";
  const GOLD       = hex6(biz?.secondaryColor) ?? "#C8972B";
  const LIGHT_GRAY = "#F5F5F5";
  const MID_GRAY   = "#888888";

  // Brand banner
  doc.rect(0, 0, doc.page.width, 70).fill(DEEP_BLUE);

  // Logo (best-effort) + company name
  let textX = 40;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 40, 15, { fit: [40, 40] });
      textX = 92;
    } catch {
      textX = 40;
    }
  }
  doc.fillColor("white")
     .font("Helvetica-Bold")
     .fontSize(18)
     .text(companyName, textX, 20);

  // Contact line beneath name
  const contactParts = [companyPhone, companyEmail].filter(Boolean);
  if (contactParts.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#BBCCDD")
       .text(contactParts.join("  •  "), textX, 44);
  }

  // Report title (right-aligned in banner)
  doc.font("Helvetica-Bold").fontSize(11).fillColor("white")
     .text("AUDIT LOG COMPLIANCE REPORT", 0, 26, { align: "right", width: doc.page.width - 40 });

  doc.y = 80;

  // Gold separator line
  doc.rect(40, doc.y, doc.page.width - 80, 2).fill(GOLD);
  doc.y += 10;

  // Metadata row
  doc.font("Helvetica").fontSize(9).fillColor(MID_GRAY)
     .text(`Date range: ${rangeLabel}`, 40, doc.y)
     .text(`Total entries: ${allRows.length}`, 0, doc.y, { align: "right", width: doc.page.width - 40 });
  doc.y += 16;

  doc.rect(40, doc.y, doc.page.width - 80, 1).fill("#DDDDDD");
  doc.y += 8;

  // ── Table ────────────────────────────────────────────────────────────────
  const COL = {
    time:   { x: 40,  w: 110 },
    actor:  { x: 150, w: 90  },
    action: { x: 240, w: 110 },
    desc:   { x: 350, w: 170 },
    ip:     { x: 520, w: 75  },
  };
  const TABLE_LEFT  = 40;
  const TABLE_WIDTH = doc.page.width - 80;
  const ROW_H       = 16;
  const HEAD_H      = 18;

  // Table header
  doc.rect(TABLE_LEFT, doc.y, TABLE_WIDTH, HEAD_H).fill(DEEP_BLUE);
  const headerY = doc.y + 5;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("white");
  doc.text("TIMESTAMP (EAT)",       COL.time.x,   headerY, { width: COL.time.w   });
  doc.text("ACTOR",                 COL.actor.x,  headerY, { width: COL.actor.w  });
  doc.text("ACTION",                COL.action.x, headerY, { width: COL.action.w });
  doc.text("DESCRIPTION",           COL.desc.x,   headerY, { width: COL.desc.w   });
  doc.text("IP ADDRESS",            COL.ip.x,     headerY, { width: COL.ip.w     });
  doc.y += HEAD_H;

  // Table rows
  doc.font("Helvetica").fontSize(7.5);
  let rowIndex = 0;

  for (const entry of allRows) {
    // Measure row height for the description column (it may wrap)
    const descText = entry.description ?? "";
    const descHeight = doc.heightOfString(descText, { width: COL.desc.w });
    const rowHeight  = Math.max(ROW_H, descHeight + 6);

    // Page break check (leave room for footer)
    if (doc.y + rowHeight > doc.page.height - 60) {
      doc.addPage();

      // Repeat header on new page
      doc.rect(TABLE_LEFT, doc.y, TABLE_WIDTH, HEAD_H).fill(DEEP_BLUE);
      const hy = doc.y + 5;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("white");
      doc.text("TIMESTAMP (EAT)",  COL.time.x,   hy, { width: COL.time.w   });
      doc.text("ACTOR",            COL.actor.x,  hy, { width: COL.actor.w  });
      doc.text("ACTION",           COL.action.x, hy, { width: COL.action.w });
      doc.text("DESCRIPTION",      COL.desc.x,   hy, { width: COL.desc.w   });
      doc.text("IP ADDRESS",       COL.ip.x,     hy, { width: COL.ip.w     });
      doc.y += HEAD_H;
      doc.font("Helvetica").fontSize(7.5);
    }

    const rowY = doc.y;
    const bg   = rowIndex % 2 === 0 ? "white" : LIGHT_GRAY;
    doc.rect(TABLE_LEFT, rowY, TABLE_WIDTH, rowHeight).fill(bg);

    // Draw a subtle bottom border
    doc.rect(TABLE_LEFT, rowY + rowHeight - 0.5, TABLE_WIDTH, 0.5).fill("#DDDDDD");

    const textY = rowY + 4;
    doc.fillColor("#222222");

    // Timestamp
    const ts = entry.createdAt
      ? new Date(entry.createdAt).toLocaleString("en-KE", {
          timeZone: "Africa/Nairobi",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit",
        })
      : "—";
    doc.text(ts, COL.time.x, textY, { width: COL.time.w, lineBreak: false });

    // Actor + role
    const actorLine = [entry.actorName ?? "System", entry.actorRole ? `(${entry.actorRole})` : ""].filter(Boolean).join(" ");
    doc.text(actorLine, COL.actor.x, textY, { width: COL.actor.w, lineBreak: false });

    // Action badge (just text in gold)
    doc.fillColor(GOLD)
       .font("Helvetica-Bold")
       .text(entry.action, COL.action.x, textY, { width: COL.action.w, lineBreak: false });

    // Description
    doc.fillColor("#222222").font("Helvetica")
       .text(descText, COL.desc.x, textY, { width: COL.desc.w });

    // IP
    doc.fillColor(MID_GRAY)
       .text(entry.ipAddress ?? "—", COL.ip.x, textY, { width: COL.ip.w, lineBreak: false });

    doc.fillColor("#222222").font("Helvetica");
    doc.y = rowY + rowHeight;
    rowIndex++;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 40;
  doc.rect(40, footerY - 4, TABLE_WIDTH, 0.5).fill(GOLD);
  doc.font("Helvetica").fontSize(8).fillColor(MID_GRAY)
     .text(
       `Generated on ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} by ${companyName} • Confidential`,
       40, footerY + 2, { align: "center", width: TABLE_WIDTH },
     );

  doc.end();
});

export default router;
