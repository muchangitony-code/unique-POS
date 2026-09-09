const fs = require("node:fs");
const path = require("node:path");

const bundle = path.resolve(__dirname, "..", "server", "index.cjs");
let source = fs.readFileSync(bundle, "utf8");

const oldBlock = `function fmt6(b) {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    county: b.county,
    phone: b.phone,
    phone2: b.phone2,
    email: b.email,
    manager: b.manager,
    kra_pin: b.kraPin,
    paybill_number: b.paybillNumber,
    paybill_account: b.paybillAccount,
    till_number: b.tillNumber,
    bank_name: b.bankName,
    bank_account_name: b.bankAccountName,
    bank_account_number: b.bankAccountNumber,
    logo_url: b.logoUrl,
    receipt_footer: b.receiptFooter,
    invoice_footer: b.invoiceFooter,
    quotation_footer: b.quotationFooter,
    is_active: b.isActive,
    created_at: b.createdAt
  };
}
`;
const newBlock = `function resolveBranchLogoUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\\/\\//i.test(value) || /^data:/i.test(value)) return value;
  let objectPath = value;
  if (/^uploads\\//i.test(value)) objectPath = \`/objects/\${value}\`;
  else if (/^objects\\//i.test(value)) objectPath = \`/\${value}\`;
  else if (/^\\/api\\/storage\\/objects\\//i.test(value)) objectPath = value.replace(/^\\/api\\/storage\\/objects\\//i, "/objects/");
  else if (/^\\/storage\\/objects\\//i.test(value)) objectPath = value.replace(/^\\/storage\\/objects\\//i, "/objects/");
  if (!objectPath.startsWith("/objects/")) return null;
  const relative = objectPath.slice("/objects/".length);
  if (!relative || relative.includes("..")) return null;
  const absolute = path2.join(STORAGE_ROOT, relative);
  return fs2.existsSync(absolute) ? value : null;
}

function fmt6(b) {
  return {
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    county: b.county,
    phone: b.phone,
    phone2: b.phone2,
    email: b.email,
    manager: b.manager,
    kra_pin: b.kraPin,
    paybill_number: b.paybillNumber,
    paybill_account: b.paybillAccount,
    till_number: b.tillNumber,
    bank_name: b.bankName,
    bank_account_name: b.bankAccountName,
    bank_account_number: b.bankAccountNumber,
    logo_url: resolveBranchLogoUrl(b.logoUrl),
    receipt_footer: b.receiptFooter,
    invoice_footer: b.invoiceFooter,
    quotation_footer: b.quotationFooter,
    is_active: b.isActive,
    created_at: b.createdAt
  };
}
`;
if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  console.log("[build] patched server/index.cjs branch branding serializer");
} else if (source.includes("function resolveBranchLogoUrl(raw)")) {
  console.log("[build] branch branding runtime already current");
} else {
  throw new Error("[build] stale server/index.cjs detected, but its branch serializer shape is unknown; refusing to deploy an unverified runtime");
}

if (!source.includes("UNIQUEPOS_TEST_TRANSACTION_RUNTIME_V1")) {
  const routeCode = String.raw`
// UNIQUEPOS_TEST_TRANSACTION_RUNTIME_V1
(function installUniquePosTestTransactionControls() {
  const pg = require("pg");
  const pool = globalThis.__UNIQUEPOS_TEST_POOL || (globalThis.__UNIQUEPOS_TEST_POOL = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }));
  const roleOf = (req) => String((req.user && req.user.role) || "");
  const canAdmin = (req) => ["administrator", "super_admin", "business_owner"].includes(roleOf(req));
  const canBulk = (req) => ["super_admin", "business_owner"].includes(roleOf(req));
  const refs = (value) => Array.isArray(value) ? value.map((v) => ({ type: String(v && v.type || ""), id: Number(v && v.id) })).filter((v) => ["sale", "invoice", "quotation"].includes(v.type) && Number.isInteger(v.id) && v.id > 0) : [];
  const jsonError = (res, code, error, detail) => res.status(code).json({ error, ...(detail ? { detail: String(detail) } : {}) });

  async function deleteRefs(list) {
    let deleted = 0;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const ref of list) {
        if (ref.type === "sale") {
          const q = await client.query("SELECT branch_id, customer_id, total, amount_paid, receipt_number FROM sales WHERE id=$1 AND is_test=TRUE FOR UPDATE", [ref.id]);
          if (!q.rows.length) continue;
          const sale = q.rows[0];
          const items = await client.query(`SELECT si.product_id, SUM(si.quantity)::numeric sold_qty, COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id=sri.return_id WHERE sr.sale_id=$1 AND sri.product_id=si.product_id),0)::numeric returned_qty FROM sale_items si WHERE si.sale_id=$1 GROUP BY si.product_id`, [ref.id]);
          for (const item of items.rows) {
            const qty = Math.max(0, Number(item.sold_qty) - Number(item.returned_qty));
            if (qty > 0) await client.query("UPDATE product_stock SET current_stock=current_stock+$1 WHERE product_id=$2 AND branch_id=$3", [qty, Number(item.product_id), Number(sale.branch_id)]);
          }
          const unpaid = Math.max(0, Number(sale.total) - Number(sale.amount_paid));
          if (sale.customer_id && unpaid > 0) await client.query("UPDATE customers SET balance=GREATEST(0,balance-$1) WHERE id=$2", [unpaid, Number(sale.customer_id)]);
          await client.query("DELETE FROM sale_return_items WHERE sale_return_id IN (SELECT id FROM sale_returns WHERE sale_id=$1)", [ref.id]);
          await client.query("DELETE FROM sale_returns WHERE sale_id=$1", [ref.id]);
          await client.query("DELETE FROM receipts WHERE sale_id=$1", [ref.id]);
          await client.query("DELETE FROM stock_movements WHERE reference=$1", [sale.receipt_number]);
          await client.query("DELETE FROM sale_items WHERE sale_id=$1", [ref.id]);
          const d = await client.query("DELETE FROM sales WHERE id=$1 AND is_test=TRUE", [ref.id]);
          deleted += Number(d.rowCount || 0);
        } else if (ref.type === "invoice") {
          const q = await client.query("SELECT id FROM invoices WHERE id=$1 AND is_test=TRUE FOR UPDATE", [ref.id]);
          if (!q.rows.length) continue;
          await client.query("DELETE FROM receipts WHERE invoice_id=$1", [ref.id]);
          await client.query("DELETE FROM invoice_payments WHERE invoice_id=$1", [ref.id]);
          await client.query("DELETE FROM invoice_items WHERE invoice_id=$1", [ref.id]);
          const d = await client.query("DELETE FROM invoices WHERE id=$1 AND is_test=TRUE", [ref.id]);
          deleted += Number(d.rowCount || 0);
        } else {
          const q = await client.query("SELECT id FROM quotations WHERE id=$1 AND is_test=TRUE FOR UPDATE", [ref.id]);
          if (!q.rows.length) continue;
          await client.query("DELETE FROM quotation_items WHERE quotation_id=$1", [ref.id]);
          const d = await client.query("DELETE FROM quotations WHERE id=$1 AND is_test=TRUE", [ref.id]);
          deleted += Number(d.rowCount || 0);
        }
      }
      await client.query("COMMIT");
      return deleted;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
  }

  const appVarMatch = source.match(/\\b([A-Za-z_$][\\w$]*)\\.use\\(express\\.static\\(/);
  if (!appVarMatch) throw new Error("[build] test transaction runtime could not locate Express application/static mount");
  const appVar = appVarMatch[1];
  const injection = `\n${routeCode}\n${appVar}.get("/api/admin/test-transactions", async (req,res) => { if (!canAdmin(req)) return jsonError(res,403,"administrator role required"); try { const r=await pool.query("SELECT id,'sale'::text type,receipt_number reference,created_at,total,branch_id,is_test FROM sales UNION ALL SELECT id,'invoice'::text type,invoice_number reference,created_at,total,branch_id,is_test FROM invoices UNION ALL SELECT id,'quotation'::text type,quotation_number reference,created_at,total,branch_id,is_test FROM quotations ORDER BY created_at DESC LIMIT 500"); res.json(r.rows); } catch(e) { jsonError(res,500,"Unable to load transactions",e.message); } });\n${appVar}.post("/api/admin/test-transactions/mark", async (req,res) => { if (!canAdmin(req)) return jsonError(res,403,"administrator role required"); const list=refs(req.body && req.body.transactions); if (!list.length) return jsonError(res,400,"No valid transactions supplied"); try { for (const r of list) { if(r.type==="sale") await pool.query("UPDATE sales SET is_test=TRUE WHERE id=$1",[r.id]); else if(r.type==="invoice") await pool.query("UPDATE invoices SET is_test=TRUE WHERE id=$1",[r.id]); else await pool.query("UPDATE quotations SET is_test=TRUE WHERE id=$1",[r.id]); } res.json({ok:true,message:list.length+" transaction(s) marked as test data."}); } catch(e) { jsonError(res,500,"Unable to mark test data",e.message); } });\n${appVar}.post("/api/admin/test-transactions/delete", async (req,res) => { if (!canAdmin(req)) return jsonError(res,403,"administrator role required"); const list=refs(req.body && req.body.transactions); if (!list.length) return jsonError(res,400,"No valid transactions supplied"); try { const deleted=await deleteRefs(list); res.json({ok:true,deleted,message:deleted+" test transaction(s) deleted."}); } catch(e) { jsonError(res,500,"Test data deletion failed",e.message); } });\n${appVar}.post("/api/admin/test-transactions/delete-all", async (req,res) => { if (!canBulk(req)) return jsonError(res,403,"super_admin role required for bulk deletion"); if (!req.body || req.body.confirmation!=="DELETE ALL TEST DATA") return jsonError(res,400,"Confirmation phrase required"); try { const r=await pool.query("SELECT id,'sale'::text type FROM sales WHERE is_test=TRUE UNION ALL SELECT id,'invoice'::text type FROM invoices WHERE is_test=TRUE UNION ALL SELECT id,'quotation'::text type FROM quotations WHERE is_test=TRUE"); const list=r.rows.map(x=>({type:x.type,id:Number(x.id)})); const deleted=list.length?await deleteRefs(list):0; res.json({ok:true,deleted,message:deleted+" marked test transaction(s) deleted."}); } catch(e) { jsonError(res,500,"Bulk test data deletion failed",e.message); } });\n`;
  source = source.replace(appVarMatch[0], injection + appVarMatch[0]);
  console.log("[build] installed monolithic TEST transaction controls");
})();
`;
  source = source.replace(appVarMatch[0], routeCode + "\n" + appVarMatch[0]);
}

fs.writeFileSync(bundle, source, "utf8");
