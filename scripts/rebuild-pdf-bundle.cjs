'use strict';
const fs = require('node:fs');

const file = 'index.cjs';
let source = fs.readFileSync(file, 'utf8');
const startMarker = 'async function renderPdfBuffer(payload, paper) {';
const start = source.indexOf(startMarker);
if (start < 0) throw new Error('Existing document PDF renderer was not found in index.cjs');
const endMarker = 'router17.get("/documents/:type/:id/preview"';
const end = source.indexOf(endMarker, start);
if (end < 0) throw new Error('Document PDF renderer end marker was not found in index.cjs');
const replacement = `async function renderPdfBuffer(payload, paper) {
  return await require("./server/pdf-engine.cjs").renderPdfBuffer(payload, paper);
}
`;
source = source.slice(0, start) + replacement + source.slice(end);

const zMarker = 'var reports_default = router18;';
if (!source.includes('router18.get("/reports/z-report.pdf"')) {
  const route = `router18.get("/reports/z-report.pdf", async (req, res) => {
  try {
    const { from: fromParam, to: toParam, start, end } = req.query;
    const from = fromParam ?? start;
    const to = toParam ?? end;
    if (!from || !to) {
      res.status(400).json({ error: "from/start and to/end dates required" });
      return;
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({ error: "from and to must be valid dates" });
      return;
    }
    toDate.setHours(23, 59, 59, 999);
    const salesBranch = branchCondition(salesTable.branchId, req);
    const [totals] = await db.select({
      total: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,
      count: sql\`count(*)\`
    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch));
    const byMethod = await db.select({
      method: salesTable.paymentMethod,
      amount: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,
      count: sql\`count(*)\`
    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch)).groupBy(salesTable.paymentMethod);
    const daily = await db.select({
      date: sql\`date(\${salesTable.createdAt})\`,
      total: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,
      count: sql\`count(*)\`
    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch)).groupBy(sql\`date(\${salesTable.createdAt})\`).orderBy(sql\`date(\${salesTable.createdAt})\`);
    const totalSales = Number(totals?.total ?? 0);
    const totalTransactions = Number(totals?.count ?? 0);
    const settings = await getDocSettings();
    const branch = req.user?.branchId ? await getBranchDetails(req.user.branchId) : null;
    const pdf = await require("./server/pdf-engine.cjs").renderZReportPdf({
      documentNumber: `Z-REPORT-${String(to).replace(/[^0-9]/g, "")}`,
      date: String(to), currency: settings.currency || "KES", branchName: branch?.name || "",
      company: { name: settings.businessName, address: settings.businessAddress, phone: settings.businessPhone, email: settings.businessEmail, primaryColor: settings.primaryColor, secondaryColor: settings.secondaryColor },
      settings, totalSales, totalTransactions, averageOrderValue: totalTransactions ? totalSales / totalTransactions : 0,
      byPaymentMethod: byMethod.map((m) => ({ method: m.method || "Unknown", amount: Number(m.amount || 0), count: Number(m.count || 0) })),
      dailyBreakdown: daily.map((d) => ({ date: d.date, total: Number(d.total || 0), count: Number(d.count || 0) }))
    });
    const filename = `z-report-${String(from)}-${String(to)}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(pdf);
  } catch (error) {
    console.error("[reports.z-report.pdf] Failed to generate Z report", error);
    res.status(500).json({ error: "Unable to generate Z report PDF." });
  }
});
`;
  if (!source.includes(zMarker)) throw new Error('reports_default marker not found');
  source = source.replace(zMarker, route + zMarker);
}

fs.writeFileSync(file, source);
console.log('PDF bundle entrypoint rebuilt successfully.');
