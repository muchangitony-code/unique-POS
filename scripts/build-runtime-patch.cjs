const fs = require("node:fs");
const path = require("node:path");

const bundle = path.resolve(__dirname, "..", "server", "index.cjs");
const source = fs.readFileSync(bundle, "utf8");

if (source.includes("function resolveBranchLogoUrl(raw)")) {
  console.log("[build] branch branding runtime already current");
  process.exit(0);
}

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

if (!source.includes(oldBlock)) {
  throw new Error("[build] stale server/index.cjs detected, but its branch serializer shape is unknown; refusing to deploy an unverified runtime");
}

fs.writeFileSync(bundle, source.replace(oldBlock, newBlock), "utf8");
console.log("[build] patched server/index.cjs branch branding serializer");
