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
    id: b.id, name: b.name, code: b.code, address: b.address, county: b.county,
    phone: b.phone, phone2: b.phone2, email: b.email, manager: b.manager,
    kra_pin: b.kraPin, paybill_number: b.paybillNumber, paybill_account: b.paybillAccount,
    till_number: b.tillNumber, bank_name: b.bankName, bank_account_name: b.bankAccountName,
    bank_account_number: b.bankAccountNumber, logo_url: resolveBranchLogoUrl(b.logoUrl),
    receipt_footer: b.receiptFooter, invoice_footer: b.invoiceFooter,
    quotation_footer: b.quotationFooter, is_active: b.isActive, created_at: b.createdAt
  };
}
`;
if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
else if (!source.includes("function resolveBranchLogoUrl(raw)")) throw new Error("[build] stale server/index.cjs detected; refusing to deploy unverified runtime");

if (!source.includes("UNIQUEPOS_TEST_TRANSACTION_RUNTIME_V3")) {
  const match = source.match(/\\b([A-Za-z_$][\\w$]*)\\.use\\(express\\.static\\(/);
  if (!match) throw new Error("[build] could not locate Express application/static mount for TEST controls");
  const app = match[1];
  const routeCode = [
    "// UNIQUEPOS_TEST_TRANSACTION_RUNTIME_V3",
    "(function(){",
    "const pg=require(\"pg\");",
    "const pool=globalThis.__UNIQUEPOS_TEST_POOL||(globalThis.__UNIQUEPOS_TEST_POOL=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3}));",
    "const role=req=>String(req.user&&req.user.role||\"\");",
    "const admin=req=>[\"administrator\",\"super_admin\",\"business_owner\"].includes(role(req));",
    "const superAdmin=req=>[\"super_admin\",\"business_owner\"].includes(role(req));",
    "const refs=v=>Array.isArray(v)?v.map(x=>({type:String(x&&x.type||\"\"),id:Number(x&&x.id)})).filter(x=>[\"sale\",\"invoice\",\"quotation\"].includes(x.type)&&Number.isInteger(x.id)&&x.id>0):[];",
    `${app}.get(\"/api/admin/test-transactions\",async(req,res)=>{if(!admin(req))return res.status(403).json({error:\"administrator role required\"});try{const r=await pool.query(\"SELECT id,'sale'::text type,receipt_number reference,created_at,total,branch_id,is_test FROM sales UNION ALL SELECT id,'invoice'::text type,invoice_number reference,created_at,total,branch_id,is_test FROM invoices UNION ALL SELECT id,'quotation'::text type,quotation_number reference,created_at,total,branch_id,is_test FROM quotations ORDER BY created_at DESC LIMIT 500\");res.json(r.rows)}catch(e){res.status(500).json({error:\"Unable to load transactions\",detail:String(e.message||e)})}});`,
    `${app}.post(\"/api/admin/test-transactions/mark\",async(req,res)=>{if(!admin(req))return res.status(403).json({error:\"administrator role required\"});const list=refs(req.body&&req.body.transactions);if(!list.length)return res.status(400).json({error:\"No valid transactions supplied\"});try{for(const r of list){if(r.type===\"sale\")await pool.query(\"UPDATE sales SET is_test=TRUE WHERE id=$1\",[r.id]);else if(r.type===\"invoice\")await pool.query(\"UPDATE invoices SET is_test=TRUE WHERE id=$1\",[r.id]);else await pool.query(\"UPDATE quotations SET is_test=TRUE WHERE id=$1\",[r.id])}res.json({ok:true,message:list.length+\" transaction(s) marked as test data.\"})}catch(e){res.status(500).json({error:\"Unable to mark test data\",detail:String(e.message||e)})}});`,
    `${app}.post(\"/api/admin/test-transactions/delete\",async(req,res)=>{if(!admin(req))return res.status(403).json({error:\"administrator role required\"});const list=refs(req.body&&req.body.transactions);if(!list.length)return res.status(400).json({error:\"No valid transactions supplied\"});const c=await pool.connect();let deleted=0;try{await c.query(\"BEGIN\");for(const r of list){if(r.type===\"sale\"){const q=await c.query(\"SELECT branch_id,customer_id,total,amount_paid,receipt_number FROM sales WHERE id=$1 AND is_test=TRUE FOR UPDATE\",[r.id]);if(!q.rows.length)continue;const s=q.rows[0];const items=await c.query(\"SELECT si.product_id,SUM(si.quantity)::numeric sold_qty,COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id=sri.return_id WHERE sr.sale_id=$1 AND sri.product_id=si.product_id),0)::numeric returned_qty FROM sale_items si WHERE si.sale_id=$1 GROUP BY si.product_id\",[r.id]);for(const i of items.rows){const qty=Math.max(0,Number(i.sold_qty)-Number(i.returned_qty));if(qty>0)await c.query(\"UPDATE product_stock SET current_stock=current_stock+$1 WHERE product_id=$2 AND branch_id=$3\",[qty,Number(i.product_id),Number(s.branch_id)])}const unpaid=Math.max(0,Number(s.total)-Number(s.amount_paid));if(s.customer_id&&unpaid>0)await c.query(\"UPDATE customers SET balance=GREATEST(0,balance-$1) WHERE id=$2\",[unpaid,Number(s.customer_id)]);await c.query(\"DELETE FROM sale_return_items WHERE sale_return_id IN (SELECT id FROM sale_returns WHERE sale_id=$1)\",[r.id]);await c.query(\"DELETE FROM sale_returns WHERE sale_id=$1\",[r.id]);await c.query(\"DELETE FROM receipts WHERE sale_id=$1\",[r.id]);await c.query(\"DELETE FROM stock_movements WHERE reference=$1\",[s.receipt_number]);await c.query(\"DELETE FROM sale_items WHERE sale_id=$1\",[r.id]);deleted+=Number((await c.query(\"DELETE FROM sales WHERE id=$1 AND is_test=TRUE\",[r.id])).rowCount||0)}else if(r.type===\"invoice\"){if(!(await c.query(\"SELECT id FROM invoices WHERE id=$1 AND is_test=TRUE FOR UPDATE\",[r.id])).rows.length)continue;await c.query(\"DELETE FROM receipts WHERE invoice_id=$1\",[r.id]);await c.query(\"DELETE FROM invoice_payments WHERE invoice_id=$1\",[r.id]);await c.query(\"DELETE FROM invoice_items WHERE invoice_id=$1\",[r.id]);deleted+=Number((await c.query(\"DELETE FROM invoices WHERE id=$1 AND is_test=TRUE\",[r.id])).rowCount||0)}else{if(!(await c.query(\"SELECT id FROM quotations WHERE id=$1 AND is_test=TRUE FOR UPDATE\",[r.id])).rows.length)continue;await c.query(\"DELETE FROM quotation_items WHERE quotation_id=$1\",[r.id]);deleted+=Number((await c.query(\"DELETE FROM quotations WHERE id=$1 AND is_test=TRUE\",[r.id])).rowCount||0)}}await c.query(\"COMMIT\");res.json({ok:true,deleted,message:deleted+\" test transaction(s) deleted.\"})}catch(e){await c.query(\"ROLLBACK\");res.status(500).json({error:\"Test data deletion failed\",detail:String(e.message||e)})}finally{c.release()}});`,
    `${app}.post(\"/api/admin/test-transactions/delete-all\",async(req,res)=>{if(!superAdmin(req))return res.status(403).json({error:\"super_admin role required for bulk deletion\"});if(!req.body||req.body.confirmation!==\"DELETE ALL TEST DATA\")return res.status(400).json({error:\"Confirmation phrase required\"});try{const r=await pool.query(\"SELECT id,'sale'::text type FROM sales WHERE is_test=TRUE UNION ALL SELECT id,'invoice'::text type FROM invoices WHERE is_test=TRUE UNION ALL SELECT id,'quotation'::text type FROM quotations WHERE is_test=TRUE\");const list=r.rows.map(x=>({type:x.type,id:Number(x.id)}));res.json({ok:true,deleted:0,candidates:list.length})}catch(e){res.status(500).json({error:\"Bulk test data deletion failed\",detail:String(e.message||e)})}});`,
    "})();"
  ].join("\n");
  source = source.replace(match[0], routeCode + "\n" + match[0]);
  console.log("[build] installed monolithic TEST transaction controls");
}

fs.writeFileSync(bundle, source, "utf8");
