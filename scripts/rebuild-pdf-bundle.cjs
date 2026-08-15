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
const replacement = 'async function renderPdfBuffer(payload, paper) {\n  return await require("./server/pdf-engine.cjs").renderPdfBuffer(payload, paper);\n}\n';
source = source.slice(0, start) + replacement + source.slice(end);

const zMarker = 'var reports_default = router18;';
if (!source.includes('router18.get("/reports/z-report.pdf"')) {
  const route = 'router18.get("/reports/z-report.pdf", async (req, res) => {\n' +
`  try {\n    const { from: fromParam, to: toParam, start, end } = req.query;\n    const from = fromParam ?? start;\n    const to = toParam ?? end;\n    if (!from || !to) {\n      res.status(400).json({ error: "from/start and to/end dates required" });\n      return;\n    }\n    const fromDate = new Date(from);\n    const toDate = new Date(to);\n    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {\n      res.status(400).json({ error: "from and to must be valid dates" });\n      return;\n    }\n    toDate.setHours(23, 59, 59, 999);\n    const salesBranch = branchCondition(salesTable.branchId, req);\n    const [totals] = await db.select({\n      total: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,\n      count: sql\`count(*)\`\n    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch));\n    const byMethod = await db.select({\n      method: salesTable.paymentMethod,\n      amount: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,\n      count: sql\`count(*)\`\n    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch)).groupBy(salesTable.paymentMethod);\n    const daily = await db.select({\n      date: sql\`date(\${salesTable.createdAt})\`,\n      total: sql\`coalesce(sum(\${salesTable.total}::numeric), 0)\`,\n      count: sql\`count(*)\`\n    }).from(salesTable).where(combine2(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch)).groupBy(sql\`date(\${salesTable.createdAt})\`).orderBy(sql\`date(\${salesTable.createdAt})\`);\n    const totalSales = Number(totals?.total ?? 0);\n    const totalTransactions = Number(totals?.count ?? 0);\n    const settings = await getDocSettings();\n    const branch = req.user?.branchId ? await getBranchDetails(req.user.branchId) : null;\n    const pdf = await require("./server/pdf-engine.cjs").renderZReportPdf({\n      documentNumber: "Z-REPORT-" + String(to).replace(/[^0-9]/g, ""),\n      date: String(to), currency: settings.currency || "KES", branchName: branch?.name || "",\n      company: { name: settings.businessName, address: settings.businessAddress, phone: settings.businessPhone, email: settings.businessEmail, primaryColor: settings.primaryColor, secondaryColor: settings.secondaryColor },\n      settings, totalSales, totalTransactions, averageOrderValue: totalTransactions ? totalSales / totalTransactions : 0,\n      byPaymentMethod: byMethod.map((m) => ({ method: m.method || "Unknown", amount: Number(m.amount || 0), count: Number(m.count || 0) })),\n      dailyBreakdown: daily.map((d) => ({ date: d.date, total: Number(d.total || 0), count: Number(d.count || 0) }))\n    });\n    const filename = ("z-report-" + String(from) + "-" + String(to) + ".pdf").replace(/[^a-zA-Z0-9._-]/g, "-");\n    res.setHeader("Content-Type", "application/pdf");\n    res.setHeader("Content-Disposition", "attachment; filename=\\\"" + filename + "\\\"");\n    res.setHeader("Content-Length", String(pdf.length));\n    res.setHeader("Cache-Control", "no-store");\n    res.setHeader("X-Content-Type-Options", "nosniff");\n    res.send(pdf);\n  } catch (error) {\n    console.error("[reports.z-report.pdf] Failed to generate Z report", error);\n    res.status(500).json({ error: "Unable to generate Z report PDF." });\n  }\n});\n`;
  if (!source.includes(zMarker)) throw new Error('reports_default marker not found');
  source = source.replace(zMarker, route + zMarker);
}

fs.writeFileSync(file, source);
console.log('PDF bundle entrypoint rebuilt successfully.');
