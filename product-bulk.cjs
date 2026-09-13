"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const PDFDocument = require("pdfkit");
const readXlsxFile = require("read-excel-file/node");
const writeXlsxFile = require("write-excel-file/node");
const pdfParse = require("pdf-parse");
const bwipjs = require("bwip-js");

const TEMPLATE_HEADERS = [
  "Product Code",
  "Barcode",
  "Product Name",
  "Category",
  "Brand",
  "Unit",
  "Cost Price",
  "Selling Price",
  "VAT",
  "Reorder Level",
  "Opening Stock",
  "Supplier",
  "Location",
  "Description",
  "Image URL"
];

const FIELD_LABELS = {
  product_code: "Product Code / SKU",
  barcode: "Barcode",
  product_name: "Product Name",
  category: "Category",
  brand: "Brand",
  unit: "Unit",
  cost_price: "Cost Price",
  selling_price: "Selling Price",
  vat_rate: "VAT",
  min_stock: "Reorder Level",
  current_stock: "Opening Stock",
  supplier: "Supplier",
  location: "Location",
  description: "Description",
  image_url: "Image URL"
};

const HEADER_ALIASES = {
  product_code: ["productcode", "productcodesku", "sku", "code", "itemcode", "productid"],
  barcode: ["barcode", "barcodenumber", "ean", "upc"],
  product_name: ["productname", "name", "itemname", "descriptionname"],
  category: ["category", "categoryname", "productcategory"],
  brand: ["brand", "brandname", "manufacturer"],
  unit: ["unit", "uom", "measure", "symbol"],
  cost_price: ["costprice", "cost", "buyprice", "purchaseprice"],
  selling_price: ["sellingprice", "saleprice", "price", "retailprice", "unitprice"],
  vat_rate: ["vat", "vatrate", "tax", "taxrate"],
  min_stock: ["reorderlevel", "minimumstock", "minstock", "reorderqty"],
  current_stock: ["openingstock", "stock", "currentstock", "qty", "quantity"],
  supplier: ["supplier", "suppliername", "vendor"],
  location: ["location", "branch", "branchcode", "branchname", "store"],
  description: ["description", "details", "notes"],
  image_url: ["imageurl", "image", "imagepath", "photourl", "pictureurl"]
};

function createProductBulkRouter(deps) {
  const {
    Router,
    pool,
    logAudit,
    makeBarcode,
    resolveWriteBranchId,
    detectProductCategorySuggestion
  } = deps;

  const router = Router();
  const IMPORT_MUTABLE_FIELDS = {
    product_code: "text",
    barcode: "text",
    product_name: "text",
    category: "text",
    brand: "text",
    unit: "text",
    cost_price: "number",
    selling_price: "number",
    vat_rate: "number",
    min_stock: "number",
    current_stock: "number",
    supplier: "text",
    location: "text",
    description: "text",
    image_url: "text"
  };
  let ensureSchemaPromise = null;
  const activeJobs = new Map();
  const IMPORT_ERROR_STATUS = 400;

  router.use("/products/imports", (req, res, next) => {
    const role = req.user?.role;
    if (["administrator", "manager", "storekeeper", "super_admin", "business_owner", "branch_manager", "inventory_manager"].includes(role)) {
      next();
      return;
    }
    res.status(req.user ? 403 : 401).json({ error: req.user ? "Insufficient permissions" : "Unauthorized" });
  });

  async function ensureSchema() {
    if (!ensureSchemaPromise) {
      ensureSchemaPromise = (async function () {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS product_import_jobs (
            id SERIAL PRIMARY KEY,
            source_type TEXT NOT NULL,
            file_name TEXT,
            source_name TEXT,
            object_path TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            column_mapping JSONB,
            options JSONB,
            summary JSONB,
            total_rows INTEGER NOT NULL DEFAULT 0,
            processed_rows INTEGER NOT NULL DEFAULT 0,
            valid_rows INTEGER NOT NULL DEFAULT 0,
            invalid_rows INTEGER NOT NULL DEFAULT 0,
            skipped_rows INTEGER NOT NULL DEFAULT 0,
            created_count INTEGER NOT NULL DEFAULT 0,
            updated_count INTEGER NOT NULL DEFAULT 0,
            duplicate_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            undo_data JSONB,
            last_error TEXT,
            created_by_id INTEGER,
            created_by_name TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            undone_at TIMESTAMPTZ
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS product_import_rows (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES product_import_jobs(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            raw_data JSONB NOT NULL,
            normalized_data JSONB,
            validation_errors JSONB,
            action TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            product_id INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_jobs_created_at_idx ON product_import_jobs (created_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_jobs_status_idx ON product_import_jobs (status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS product_import_rows_job_id_idx ON product_import_rows (job_id, row_number)`);
      })();
    }
    return ensureSchemaPromise;
  }

  function safeJson(value, fallback) {
    if (value == null) return fallback;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return fallback; }
  }
  function headerKey(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function trimText(value) { return String(value == null ? "" : value).trim(); }
  const categorizationMemo = new Map();
  async function suggestCategory(productName) {
    const name = trimText(productName);
    if (!name || typeof detectProductCategorySuggestion !== "function") return null;
    const key = name.toLowerCase();
    if (categorizationMemo.has(key)) return categorizationMemo.get(key);
    const result = await detectProductCategorySuggestion(name).catch(() => null);
    categorizationMemo.set(key, result || null);
    return result || null;
  }
  function importValidationError(message) { const error = new Error(message); error.statusCode = IMPORT_ERROR_STATUS; return error; }
  function extensionFromName(fileName) { return path.extname(trimText(fileName)).toLowerCase(); }
  function normalizeMimeType(value) { return trimText(value).toLowerCase().split(";")[0]; }
  function isPdfBuffer(buffer) { return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF"; }
  function isZipBuffer(buffer) { return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; }
  function isOleBuffer(buffer) { const signature = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]; return Buffer.isBuffer(buffer) && buffer.length >= signature.length && signature.every((byte,index)=>buffer[index]===byte); }
  function looksLikeDelimitedText(buffer) {
    if (!Buffer.isBuffer(buffer)) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8").trim();
    if (!sample) return false;
    const lines = sample.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).slice(0,10);
    if (lines.length < 2) return false;
    for (const delimiter of [",", "\t"]) {
      const counts = lines.map(line=>line.split(delimiter).length-1).filter(count=>count>0);
      if (counts.length >= 2 && counts.every(count=>count===counts[0])) return true;
    }
    return false;
  }
  function detectImportFormat({ fileName, mimeType, sourceTypeHint, buffer }) {
    const extension = extensionFromName(fileName); const mime = normalizeMimeType(mimeType); const hint = trimText(sourceTypeHint).toLowerCase();
    const csvMimes = new Set(["text/csv","application/csv","text/plain"]);
    const xlsxMimes = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel","application/octet-stream"]);
    const pdfMimes = new Set(["application/pdf"]);
    if (extension === ".csv" || hint === "csv" || csvMimes.has(mime)) { if (!looksLikeDelimitedText(buffer)) throw importValidationError("The uploaded CSV file could not be parsed. Ensure it is comma- or tab-delimited text with a header row."); return { sourceType:"csv", extension:extension||".csv", mimeType:mime||"text/csv" }; }
    if (extension === ".xlsx" || extension === ".xls" || hint === "xlsx" || hint === "xls" || (xlsxMimes.has(mime) && (isZipBuffer(buffer) || isOleBuffer(buffer)))) return { sourceType:"xlsx", extension:extension||(isOleBuffer(buffer)?".xls":".xlsx"), mimeType:mime||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    if (extension === ".pdf" || hint === "pdf" || pdfMimes.has(mime) || isPdfBuffer(buffer)) return { sourceType:"pdf", extension:extension||".pdf", mimeType:mime||"application/pdf" };
    throw importValidationError("Unsupported import file. Upload CSV (.csv), Excel (.xlsx or .xls), or text-based PDF (.pdf).");
  }
  function normalizedNameKey(value) { return trimText(value).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function toNumber(value) { if (value == null || value === "") return null; const cleaned=String(value).replace(/,/g,"").trim(); if(!cleaned)return null; const parsed=Number(cleaned); return Number.isFinite(parsed)?parsed:null; }
  function mapFieldLabel(field) { return FIELD_LABELS[field] || field; }
  function csvEscape(value) { if(value==null)return ""; const stringValue=String(value); return /[",\n]/.test(stringValue)?`"${stringValue.replace(/"/g,'""')}"`:stringValue; }
  function parseDelimitedLine(line, delimiter) { const out=[]; let current=""; let quoted=false; for(let index=0;index<line.length;index+=1){const char=line[index],next=line[index+1]; if(char==='"'){if(quoted&&next==='"'){current+='"';index+=1;}else quoted=!quoted;continue;} if(char===delimiter&&!quoted){out.push(current);current="";continue;} current+=char;} out.push(current); return out.map(value=>value.trim()); }
  function parseDelimitedText(text) { const normalized=String(text||"").replace(/\r\n?/g,"\n").trim(); if(!normalized)return []; const delimiter=normalized.includes("\t")?"\t":","; return normalized.split("\n").filter(Boolean).map(line=>parseDelimitedLine(line,delimiter)); }
  function rowsFromMatrix(matrix) { if(!Array.isArray(matrix)||matrix.length===0)return {headers:[],rows:[]}; const headers=matrix[0].map((value,index)=>trimText(value)||`Column ${index+1}`); const rows=matrix.slice(1).map((cells,rowIndex)=>{const record={};headers.forEach((header,headerIndex)=>{record[header]=cells[headerIndex]==null?"":String(cells[headerIndex]).trim();});return {row_number:rowIndex+2,raw_data:record};}).filter(row=>Object.values(row.raw_data).some(value=>trimText(value)!=="")); return {headers,rows}; }
  function detectMapping(headers) { const mapping={}; for(const field of Object.keys(FIELD_LABELS)){const aliases=HEADER_ALIASES[field]||[];const match=headers.find(header=>aliases.includes(headerKey(header)));if(match)mapping[field]=match;} return mapping; }
  function normalizeImportedRow(rawData,mapping) { const getValue=field=>trimText(rawData[mapping[field]]); return {product_code:getValue("product_code"),barcode:getValue("barcode"),product_name:getValue("product_name"),category:getValue("category"),brand:getValue("brand"),unit:getValue("unit"),cost_price:toNumber(getValue("cost_price")),selling_price:toNumber(getValue("selling_price")),vat_rate:toNumber(getValue("vat_rate")),min_stock:toNumber(getValue("min_stock")),current_stock:toNumber(getValue("current_stock")),supplier:getValue("supplier"),location:getValue("location"),description:getValue("description"),image_url:getValue("image_url")}; }
  function validateImportedRow(normalized) { const errors=[]; if(!normalized.product_name)errors.push("Product Name is required — every product must have a name."); if(normalized.selling_price==null)errors.push("Selling Price is required — enter the price this product is sold for."); if(normalized.cost_price!=null&&normalized.cost_price<0)errors.push("Cost Price must be zero or greater."); if(normalized.selling_price!=null&&normalized.selling_price<0)errors.push("Selling Price must be zero or greater."); if(normalized.vat_rate!=null&&normalized.vat_rate<0)errors.push("VAT must be zero or greater."); if(normalized.min_stock!=null&&normalized.min_stock<0)errors.push("Reorder Level must be zero or greater."); if(normalized.current_stock!=null&&normalized.current_stock<0)errors.push("Opening Stock must be zero or greater."); if(normalized.image_url&&!/^https?:\/\//i.test(normalized.image_url)&&!normalized.image_url.startsWith("/objects/"))errors.push("Image URL must use http(s) or a saved object path."); return errors; }
  async function readObjectBuffer(objectPath) { const root=path.resolve(process.env.LOCAL_STORAGE_DIR||path.join(process.cwd(),"storage")); if(!objectPath.startsWith("/objects/"))throw new Error("Invalid uploaded object path"); const relativePath=objectPath.slice("/objects/".length); const absolutePath=path.resolve(root,relativePath); if(absolutePath!==root&&!absolutePath.startsWith(`${root}${path.sep}`))throw new Error("Invalid uploaded object path"); return await fs.readFile(absolutePath); }
  async function parseImportSource({source_type,object_path,paste_text,file_name}) { if(paste_text)return rowsFromMatrix(parseDelimitedText(paste_text)); if(!object_path)throw new Error("An uploaded import file or pasted spreadsheet data is required."); const buffer=await readObjectBuffer(object_path); return parseBufferSource({buffer,source_type,file_name:file_name||object_path}); }
  async function parseBufferSource({buffer,source_type,file_name}) { const extension=extensionFromName(file_name||""); if(extension===".csv"||source_type==="csv"||source_type==="paste")return rowsFromMatrix(parseDelimitedText(buffer.toString("utf8"))); if(extension===".xlsx"||extension===".xls"||source_type==="xlsx"){try{const workbook=await readXlsxFile(buffer);const rows=Array.isArray(workbook)&&workbook[0]&&Array.isArray(workbook[0].data)?workbook[0].data:workbook;return rowsFromMatrix(rows);}catch(error){const message=error instanceof Error?error.message:String(error);throw importValidationError(`Unable to read Excel file. Please upload a valid .xlsx or .xls file. ${message}`);}} if(extension===".pdf"||source_type==="pdf"){const parsed=await pdfParse(buffer);const lines=String(parsed.text||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(!lines.length)throw importValidationError("No selectable text was detected in the PDF. Upload a text-based PDF or use CSV/Excel instead.");const matrix=lines.map(line=>line.includes("\t")?line.split("\t"):line.split(/\s{2,}/g));return rowsFromMatrix(matrix);} throw importValidationError("Unsupported import file. Upload CSV (.csv), Excel (.xlsx or .xls), or text-based PDF (.pdf)."); }
  function collectRawBody(req,limitBytes){const max=limitBytes||10*1024*1024;return new Promise((resolve,reject)=>{const chunks=[];let size=0;let aborted=false;req.on("data",chunk=>{if(aborted)return;size+=chunk.length;if(size>max){aborted=true;reject(importValidationError("Upload too large. Maximum file size is 10 MB."));req.destroy();return;}chunks.push(chunk);});req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject);});}
  function parseMultipartBody(buffer,contentType){const match=String(contentType||"").match(/boundary=(?:"([^"]+)"|([^;]+))/i);if(!match)throw importValidationError("Multipart upload boundary is missing.");const boundary=Buffer.from(`--${match[1]||match[2]}`);const fields={};let file=null;let cursor=0;while(cursor<buffer.length){const start=buffer.indexOf(boundary,cursor);if(start<0)break;const headerStart=start+boundary.length; if(buffer.slice(headerStart,headerStart+2).toString()==="--")break;let partStart=headerStart;if(buffer.slice(partStart,partStart+2).toString()==="\r\n")partStart+=2;const headerEnd=buffer.indexOf(Buffer.from("\r\n\r\n"),partStart);if(headerEnd<0)break;const headerText=buffer.slice(partStart,headerEnd).toString("utf8");const nextBoundary=buffer.indexOf(boundary,headerEnd+4);if(nextBoundary<0)break;const contentEnd=nextBoundary-2;const partBuffer=buffer.slice(headerEnd+4,contentEnd);const disposition=headerText.match(/Content-Disposition:\s*form-data;([^\r\n]*)/i)?.[1]||"";const name=disposition.match(/name="([^"]+)"/i)?.[1];const fileName=disposition.match(/filename="([^"]*)"/i)?.[1];const contentTypeMatch=headerText.match(/Content-Type:\s*([^\r\n]+)/i);const partMime=contentTypeMatch?contentTypeMatch[1].trim():"";if(!name){cursor=nextBoundary;continue;}if(fileName!==undefined){file={fieldName:name,fileName:fileName||"upload",mimeType:partMime,buffer:partBuffer};}else fields[name]=trimText(partBuffer.toString("utf8"));cursor=nextBoundary+boundary.length;}if(!file)throw importValidationError("No file was uploaded. Attach a CSV, Excel, or PDF file and try again.");return {fields,file};}
  async function fetchExistingMatches(codes,barcodes,names){const params=[];const clauses=[];if(codes.length){params.push(codes);clauses.push(`product_code = ANY($${params.length})`);}if(barcodes.length){params.push(barcodes);clauses.push(`barcode = ANY($${params.length})`);}if(names.length){params.push(names);clauses.push(`regexp_replace(lower(product_name), '[^a-z0-9]+', '', 'g') = ANY($${params.length})`);}if(!clauses.length)return [];const {rows}=await pool.query(`SELECT id, product_code, barcode, product_name FROM products WHERE ${clauses.join(" OR ")}`,params);return rows;}
  async function saveDraftJob({sourceType,sourceName,fileName,objectPath,mapping,preparedRows,actor}){await ensureSchema();const summary=buildDraftSummary(preparedRows);const {rows:jobRows}=await pool.query(`INSERT INTO product_import_jobs (source_type,source_name,file_name,object_path,status,column_mapping,summary,total_rows,valid_rows,invalid_rows,error_count,created_by_id,created_by_name) VALUES ($1,$2,$3,$4,'draft',$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING *`,[sourceType,sourceName||fileName||sourceType,fileName||null,objectPath||null,JSON.stringify(mapping),JSON.stringify(summary),preparedRows.length,summary.valid_rows,summary.invalid_rows,summary.error_count,actor?.userId||null,actor?.name||null]);const job=jobRows[0];await insertImportRows(job.id,preparedRows);return job;}
  function buildDraftSummary(preparedRows){let valid=0,invalid=0,duplicates=0,autoCategorized=0,uncategorized=0;for(const row of preparedRows){if(Array.isArray(row.validation_errors)&&row.validation_errors.length)invalid+=1;else valid+=1;if(row.action==="duplicate")duplicates+=1;if(row.normalized_data?.category_detection?.auto_applied)autoCategorized+=1;if(!trimText(row.normalized_data?.category))uncategorized+=1;}return {valid_rows:valid,invalid_rows:invalid,duplicate_rows:duplicates,auto_categorized_count:autoCategorized,uncategorized_count:uncategorized,error_count:invalid};}
  async function insertImportRows(jobId,preparedRows){const batchSize=200;for(let start=0;start<preparedRows.length;start+=batchSize){const batch=preparedRows.slice(start,start+batchSize);const values=[];const params=[];batch.forEach((row,index)=>{const offset=index*6;values.push(`($${offset+1},$${offset+2},$${offset+3}::jsonb,$${offset+4}::jsonb,$${offset+5}::jsonb,$${offset+6})`);params.push(jobId,row.row_number,JSON.stringify(row.raw_data),JSON.stringify(row.normalized_data),JSON.stringify(row.validation_errors),row.action);});await pool.query(`INSERT INTO product_import_rows (job_id,row_number,raw_data,normalized_data,validation_errors,action) VALUES ${values.join(",")}`,params);}}
  async function prepareDraftRows(source){const mapping=detectMapping(source.headers);const prepared=[];for(const row of source.rows){const normalized=applyImportDefaults(normalizeImportedRow(row.raw_data,mapping),row.row_number);if(!trimText(normalized.category)){const suggestion=await suggestCategory(normalized.product_name);if(suggestion&&suggestion.categoryName){normalized.category=suggestion.categoryName;normalized.category_detection={category_name:suggestion.categoryName,rule_id:suggestion.ruleId||null,rule_name:suggestion.ruleName||null,matched_keyword:suggestion.matchedKeyword||null,auto_applied:true};}}prepared.push({row_number:row.row_number,raw_data:row.raw_data,normalized_data:normalized,validation_errors:[],action:"create"});}const codeSet=new Set(),barcodeSet=new Set(),nameSet=new Set();prepared.forEach(row=>{if(row.normalized_data.product_code)codeSet.add(row.normalized_data.product_code);if(row.normalized_data.barcode)barcodeSet.add(row.normalized_data.barcode);if(row.normalized_data.product_name)nameSet.add(normalizedNameKey(row.normalized_data.product_name));});const existing=await fetchExistingMatches([...codeSet],[...barcodeSet],[...nameSet]);const existingByCode=new Map(existing.filter(item=>item.product_code).map(item=>[item.product_code,item]));const existingByBarcode=new Map(existing.filter(item=>item.barcode).map(item=>[item.barcode,item]));const existingByName=new Map(existing.filter(item=>item.product_name).map(item=>[normalizedNameKey(item.product_name),item]));prepared.forEach(row=>{const errors=validateImportedRow(row.normalized_data);const existingMatch=existingByCode.get(row.normalized_data.product_code)||existingByBarcode.get(row.normalized_data.barcode)||existingByName.get(normalizedNameKey(row.normalized_data.product_name));if(existingMatch){row.normalized_data.existing_match=existingMatch;row.action="update";}row.validation_errors=errors;});return {mapping,rows:prepared};}
  async function loadJob(jobId){await ensureSchema();const {rows}=await pool.query(`SELECT * FROM product_import_jobs WHERE id=$1`,[jobId]);return rows[0]||null;}
  async function loadJobRows(jobId,options={}){const page=Math.max(1,Number(options.page||1));const limit=Math.min(200,Math.max(1,Number(options.limit||50)));const offset=(page-1)*limit;const filters=[`job_id=$1`];const params=[jobId];if(options.onlyErrors)filters.push(`jsonb_array_length(COALESCE(validation_errors,'[]'::jsonb))>0`);const [{rows:dataRows},{rows:countRows}]=await Promise.all([pool.query(`SELECT * FROM product_import_rows WHERE ${filters.join(" AND ")} ORDER BY row_number LIMIT $2 OFFSET $3`,[jobId,limit,offset]),pool.query(`SELECT count(*)::int AS total FROM product_import_rows WHERE ${filters.join(" AND ")}`,params)]);return {rows:dataRows,total:countRows[0]?.total||0,page,limit};}
  function serializeJob(job){if(!job)return null;return {id:job.id,source_type:job.source_type,source_name:job.source_name,file_name:job.file_name,status:job.status,column_mapping:safeJson(job.column_mapping,{}),options:safeJson(job.options,{}),summary:safeJson(job.summary,{}),total_rows:Number(job.total_rows||0),processed_rows:Number(job.processed_rows||0),valid_rows:Number(job.valid_rows||0),invalid_rows:Number(job.invalid_rows||0),skipped_rows:Number(job.skipped_rows||0),created_count:Number(job.created_count||0),updated_count:Number(job.updated_count||0),duplicate_count:Number(job.duplicate_count||0),error_count:Number(job.error_count||0),created_by_id:job.created_by_id,created_by_name:job.created_by_name,last_error:job.last_error,created_at:job.created_at,started_at:job.started_at,completed_at:job.completed_at,undone_at:job.undone_at};}
  async function remapJob(jobId,mapping){const rows=(await pool.query(`SELECT id,row_number,raw_data FROM product_import_rows WHERE job_id=$1 ORDER BY row_number`,[jobId])).rows;const prepared=[];for(const row of rows){const rawData=safeJson(row.raw_data,{});const normalized=applyImportDefaults(normalizeImportedRow(rawData,mapping),row.row_number);if(!trimText(normalized.category)){const suggestion=await suggestCategory(normalized.product_name);if(suggestion&&suggestion.categoryName){normalized.category=suggestion.categoryName;normalized.category_detection={category_name:suggestion.categoryName,rule_id:suggestion.ruleId||null,rule_name:suggestion.ruleName||null,matched_keyword:suggestion.matchedKeyword||null,auto_applied:true};}}const validationErrors=validateImportedRow(normalized);prepared.push({id:row.id,normalized,validationErrors});}const codes=new Set(),barcodes=new Set(),names=new Set();prepared.forEach(row=>{if(row.normalized.product_code)codes.add(row.normalized.product_code);if(row.normalized.barcode)barcodes.add(row.normalized.barcode);if(row.normalized.product_name)names.add(normalizedNameKey(row.normalized.product_name));});const existing=await fetchExistingMatches([...codes],[...barcodes],[...names]);const existingByCode=new Map(existing.filter(item=>item.product_code).map(item=>[item.product_code,item]));const existingByBarcode=new Map(existing.filter(item=>item.barcode).map(item=>[item.barcode,item]));const existingByName=new Map(existing.filter(item=>item.product_name).map(item=>[normalizedNameKey(item.product_name),item]));let valid=0,invalid=0,autoCategorized=0,uncategorized=0;for(const row of prepared){const existingMatch=existingByCode.get(row.normalized.product_code)||existingByBarcode.get(row.normalized.barcode)||existingByName.get(normalizedNameKey(row.normalized.product_name));if(existingMatch)row.normalized.existing_match=existingMatch;const action=existingMatch?"update":"create";await pool.query(`UPDATE product_import_rows SET normalized_data=$2::jsonb,validation_errors=$3::jsonb,action=$4 WHERE id=$1`,[row.id,JSON.stringify(row.normalized),JSON.stringify(row.validationErrors),action]);if(row.normalized?.category_detection?.auto_applied)autoCategorized+=1;if(!trimText(row.normalized?.category))uncategorized+=1;if(row.validationErrors.length)invalid+=1;else valid+=1;}await pool.query(`UPDATE product_import_jobs SET column_mapping=$2::jsonb,valid_rows=$3,invalid_rows=$4,error_count=$4,summary=$5::jsonb WHERE id=$1`,[jobId,JSON.stringify(mapping),valid,invalid,JSON.stringify({valid_rows:valid,invalid_rows:invalid,auto_categorized_count:autoCategorized,uncategorized_count:uncategorized,error_count:invalid})]);}
  async function getReferenceId(client,table,name,actor,type,options={}){const normalized=trimText(name);if(!normalized)return null;const existing=await client.query(`SELECT id FROM ${table} WHERE lower(name)=lower($1) LIMIT 1`,[normalized]);if(existing.rows[0])return existing.rows[0].id;if(table==="suppliers"){let branchId=Number(options.branchId||actor?.branchId||0);if(!Number.isInteger(branchId)||branchId<=0){const fallbackBranch=await client.query(`SELECT id FROM branches ORDER BY id LIMIT 1`);branchId=Number(fallbackBranch.rows[0]?.id||0);}if(!Number.isInteger(branchId)||branchId<=0)throw importValidationError("A branch is required before creating suppliers during bulk import.");const created=await client.query(`INSERT INTO suppliers (name,branch_id,created_at) VALUES ($1,$2,NOW()) RETURNING id`,[normalized,branchId]);await logAudit({user:actor,headers:{},socket:{}},{action:`${type}.created_by_import`,entityType:type,entityId:created.rows[0].id,description:`Created ${type} "${normalized}" during bulk import`});return created.rows[0].id;}const created=await client.query(`INSERT INTO ${table} (name,created_at) VALUES ($1,NOW()) RETURNING id`,[normalized]);await logAudit({user:actor,headers:{},socket:{}},{action:`${type}.created_by_import`,entityType:type,entityId:created.rows[0].id,description:`Created ${type} "${normalized}" during bulk import`});return created.rows[0].id;}
  async function resolveBranchId(client,location,fallbackBranchId){const normalized=trimText(location);if(!normalized)return fallbackBranchId;const branch=await client.query(`SELECT id FROM branches WHERE lower(code)=lower($1) OR lower(name)=lower($1) ORDER BY id LIMIT 1`,[normalized]);return branch.rows[0]?.id||fallbackBranchId;}
  async function fetchExistingProduct(client,normalized){const productCode=trimText(normalized.product_code),barcode=trimText(normalized.barcode),productName=trimText(normalized.product_name);const {rows}=await client.query(`SELECT * FROM products WHERE ($1<>'' AND product_code=$1) OR ($2<>'' AND barcode=$2) OR ($3<>'' AND regexp_replace(lower(product_name),'[^a-z0-9]+','','g')=$4) ORDER BY CASE WHEN product_code=$1 THEN 0 WHEN barcode=$2 THEN 1 ELSE 2 END,id LIMIT 1`,[productCode,barcode,productName,normalizedNameKey(productName)]);return rows[0]||null;}
  async function getBranchStock(client,branchId,productId){const {rows}=await client.query(`SELECT id,current_stock,min_stock FROM product_stock WHERE branch_id=$1 AND product_id=$2 LIMIT 1`,[branchId,productId]);return rows[0]||null;}
  async function upsertBranchStock(client,branchId,productId,currentStock,minStock){const {rows}=await client.query(`INSERT INTO product_stock (branch_id,product_id,current_stock,min_stock,created_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (branch_id,product_id) DO UPDATE SET current_stock=EXCLUDED.current_stock,min_stock=EXCLUDED.min_stock RETURNING id,current_stock,min_stock`,[branchId,productId,currentStock,minStock]);return rows[0];}
  function uniqueDuplicateCode(base,jobId,rowNumber){const clean=trimText(base||"ITEM").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-+|-+$/g,"").toUpperCase().slice(0,40)||"ITEM";return `${clean}-D${jobId}-${rowNumber}`;}
  function applyImportDefaults(normalized){return {...normalized,vat_rate:normalized.vat_rate??16,min_stock:normalized.min_stock??0,current_stock:normalized.current_stock??0,cost_price:normalized.cost_price??0,selling_price:normalized.selling_price};}

  async function processImportJob(jobId,actor){let client=null;try{const job=await loadJob(jobId);if(!job)throw new Error("Import job not found.");const options=safeJson(job.options,{});client=await pool.connect();await client.query("BEGIN");await client.query(`UPDATE product_import_jobs SET status='processing',started_at=NOW(),last_error=NULL WHERE id=$1`,[jobId]);const rows=(await client.query(`SELECT * FROM product_import_rows WHERE job_id=$1 ORDER BY row_number`,[jobId])).rows;const branchId=await resolveWriteBranchId({user:actor});let processed=0,createdCount=0,updatedCount=0,skippedCount=0,duplicateCount=0,errorCount=0,autoCategorizedCount=0,uncategorizedCount=0;const uncategorizedRows=[];const undoData={created_product_ids:[],updated_products:[]};for(const row of rows){if(Array.isArray(row.validation_errors)&&row.validation_errors.length){errorCount+=1;await client.query(`UPDATE product_import_rows SET status='error' WHERE id=$1`,[row.id]);processed+=1;continue;}const normalized={...safeJson(row.normalized_data,{})};const existing=await fetchExistingProduct(client,normalized);const hasCategoryText=!!trimText(normalized.category);if((!hasCategoryText||(options.recategorize&&normalized.product_name))&&normalized.product_name){const suggestion=await suggestCategory(normalized.product_name);if(suggestion&&suggestion.categoryName&&(options.recategorize||(!hasCategoryText&&!existing?.category_id))){normalized.category=suggestion.categoryName;normalized.category_detection={category_name:suggestion.categoryName,rule_id:suggestion.ruleId||null,rule_name:suggestion.ruleName||null,matched_keyword:suggestion.matchedKeyword||null,auto_applied:true};}}if(normalized?.category_detection?.auto_applied)autoCategorizedCount+=1;if(!trimText(normalized.category)){uncategorizedCount+=1;if(uncategorizedRows.length<50)uncategorizedRows.push(row.row_number);}const categoryId=options.auto_create_references?await getReferenceId(client,"categories",normalized.category,actor,"category"):null;const brandId=options.auto_create_references?await getReferenceId(client,"brands",normalized.brand,actor,"brand"):null;const supplierId=options.auto_create_references?await getReferenceId(client,"suppliers",normalized.supplier,actor,"supplier",{branchId}):null;let action=row.action||(existing?"update":"create");if(existing&&options.on_duplicate==="skip")action="skip";if(existing&&options.on_duplicate==="duplicate")action="duplicate";if(action==="skip"){skippedCount+=1;await client.query(`UPDATE product_import_rows SET status='skipped',action='skip',product_id=$2,normalized_data=$3::jsonb WHERE id=$1`,[row.id,existing?.id||null,JSON.stringify(normalized)]);processed+=1;continue;}if(action==="update"&&existing){const beforeStock=branchId?await getBranchStock(client,branchId,existing.id):null;undoData.updated_products.push({product_id:existing.id,branch_id:branchId,before_product:existing,before_stock:beforeStock});const updated=await client.query(`UPDATE products SET product_code=$2,barcode=NULLIF($3,''),product_name=$4,description=NULLIF($5,''),category_id=$6,brand_id=$7,supplier_id=$8,cost_price=$9,selling_price=$10,vat_rate=$11,image_url=NULLIF($12,''),unit=NULLIF($13,'') WHERE id=$1 RETURNING id`,[existing.id,normalized.product_code,normalized.barcode,normalized.product_name,normalized.description,categoryId,brandId,supplierId,String(normalized.cost_price??0),String(normalized.selling_price??0),String(normalized.vat_rate??16),normalized.image_url,normalized.unit]);if(branchId)await upsertBranchStock(client,branchId,existing.id,Number(normalized.current_stock??0),Number(normalized.min_stock??0));await client.query(`UPDATE product_import_rows SET status='updated',action='update',product_id=$2,normalized_data=$3::jsonb WHERE id=$1`,[row.id,updated.rows[0].id,JSON.stringify(normalized)]);updatedCount+=1;}else{let productCode=normalized.product_code;let barcode=normalized.barcode||null;if(existing&&action==="duplicate"){productCode=uniqueDuplicateCode(normalized.product_code||normalized.product_name||"ITEM",jobId,row.row_number);duplicateCount+=1;barcode=barcode||makeBarcode(productCode,row.row_number);}if(!productCode){productCode=`AUTO-${jobId}-${row.row_number}`;}const created=await client.query(`INSERT INTO products (product_code,barcode,product_name,description,category_id,brand_id,supplier_id,cost_price,selling_price,vat_rate,current_stock,min_stock,image_url,unit,created_at) VALUES ($1,NULLIF($2,''),$3,NULLIF($4,''),$5,$6,$7,$8,$9,$10,$11,$12,NULLIF($13,''),NULLIF($14,''),NOW()) RETURNING id`,[productCode,barcode,normalized.product_name,normalized.description,categoryId,brandId,supplierId,String(normalized.cost_price??0),String(normalized.selling_price??0),String(normalized.vat_rate??16),Number(normalized.current_stock??0),Number(normalized.min_stock??0),normalized.image_url,normalized.unit]);const productId=created.rows[0].id;undoData.created_product_ids.push(productId);if(branchId)await upsertBranchStock(client,branchId,productId,Number(normalized.current_stock??0),Number(normalized.min_stock??0));await client.query(`UPDATE product_import_rows SET status='created',action=$2,product_id=$3,normalized_data=$4::jsonb WHERE id=$1`,[row.id,action,productId,JSON.stringify(normalized)]);createdCount+=1;}processed+=1;if(processed%25===0||processed===rows.length)await pool.query(`UPDATE product_import_jobs SET processed_rows=$2,created_count=$3,updated_count=$4,skipped_rows=$5,duplicate_count=$6,error_count=$7 WHERE id=$1`,[jobId,processed,createdCount,updatedCount,skippedCount,duplicateCount,errorCount]);}await client.query(`UPDATE product_import_jobs SET status='completed',processed_rows=$2,created_count=$3,updated_count=$4,skipped_rows=$5,duplicate_count=$6,error_count=$7,summary=$8::jsonb,undo_data=$9::jsonb,completed_at=NOW() WHERE id=$1`,[jobId,processed,createdCount,updatedCount,skippedCount,duplicateCount,errorCount,JSON.stringify({processed_rows:processed,created_count:createdCount,updated_count:updatedCount,skipped_rows:skippedCount,duplicate_count:duplicateCount,auto_categorized_count:autoCategorizedCount,uncategorized_count:uncategorizedCount,uncategorized_rows:uncategorizedRows,error_count:errorCount}),JSON.stringify(undoData)]);await client.query("COMMIT");await logAudit({user:actor,headers:{},socket:{}},{action:"product.import_completed",entityType:"product_import",entityId:jobId,description:`Completed bulk product import #${jobId}`,metadata:{processed,createdCount,updatedCount,skippedCount,duplicateCount,autoCategorizedCount,uncategorizedCount,errorCount}});}catch(error){if(client){try{await client.query("ROLLBACK");}catch{}}const message=error instanceof Error?error.message:String(error);console.error(`[products.imports] Job ${jobId} failed`,error);try{await pool.query(`UPDATE product_import_jobs SET status='failed',last_error=$2,completed_at=NOW() WHERE id=$1`,[jobId,message]);}catch{}try{await logAudit({user:actor,headers:{},socket:{}},{action:"product.import_failed",entityType:"product_import",entityId:jobId,description:`Bulk product import #${jobId} failed: ${message}`});}catch{}}finally{if(client)client.release();activeJobs.delete(jobId);}}
  function startBackgroundJob(jobId,actor){if(activeJobs.has(jobId))return;activeJobs.set(jobId,true);setImmediate(()=>{processImportJob(jobId,actor).catch(()=>{activeJobs.delete(jobId);});});}
  function requireProductIds(body){const ids=Array.isArray(body?.product_ids)?body.product_ids.map(value=>Number(value)).filter(value=>Number.isInteger(value)&&value>0):[];if(!ids.length)throw new Error("Select at least one product.");return [...new Set(ids)];}
  async function fetchProductsForIds(ids,branchId){const {rows}=await pool.query(`SELECT p.id,p.product_code,p.barcode,p.product_name,p.description,p.unit,p.cost_price::numeric::text AS cost_price,p.selling_price::numeric::text AS selling_price,p.vat_rate::numeric::text AS vat_rate,p.image_url,c.name AS category_name,b.name AS brand_name,s.name AS supplier_name,COALESCE(ps.current_stock,p.current_stock) AS current_stock,COALESCE(ps.min_stock,p.min_stock) AS min_stock FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN product_stock ps ON ps.product_id=p.id AND ($2::int IS NULL OR ps.branch_id=$2) WHERE p.id=ANY($1::int[]) ORDER BY p.product_name`,[ids,branchId||null]);return rows;}
  async function fetchAllProducts(branchId){const {rows}=await pool.query(`SELECT p.id,p.product_code,p.barcode,p.product_name,p.description,p.unit,p.cost_price::numeric::text AS cost_price,p.selling_price::numeric::text AS selling_price,p.vat_rate::numeric::text AS vat_rate,p.image_url,c.name AS category_name,b.name AS brand_name,s.name AS supplier_name,COALESCE(SUM(ps.current_stock) FILTER (WHERE $1::int IS NULL OR ps.branch_id=$1),p.current_stock) AS current_stock,COALESCE(MAX(ps.min_stock) FILTER (WHERE $1::int IS NULL OR ps.branch_id=$1),p.min_stock) AS min_stock FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN product_stock ps ON ps.product_id=p.id GROUP BY p.id,c.name,b.name,s.name ORDER BY p.product_name`,[branchId||null]);return rows;}

  // The remaining bulk endpoints use the same existing implementation below.
  router.post("/products/imports/upload-and-parse", async (req,res)=>{try{await ensureSchema();const raw=await collectRawBody(req);const {fields,file}=parseMultipartBody(raw,req.headers["content-type"]);const format=detectImportFormat({fileName:file.fileName,mimeType:file.mimeType,sourceTypeHint:fields.source_type,buffer:file.buffer});const source=await parseBufferSource({buffer:file.buffer,source_type:format.sourceType,file_name:file.fileName});const prepared=await prepareDraftRows(source);const actor=req.user||{};const job=await saveDraftJob({sourceType:format.sourceType,sourceName:fields.source_name||file.fileName,fileName:file.fileName,objectPath:null,mapping:prepared.mapping,preparedRows:prepared.rows,actor});res.status(201).json({job:serializeJob(job),rows:prepared.rows.map(row=>({row_number:row.row_number,raw_data:row.raw_data,normalized_data:row.normalized_data,validation_errors:row.validation_errors,action:row.action})),headers:source.headers});}catch(error){const status=error?.statusCode||400;res.status(status).json({error:error instanceof Error?error.message:String(error)});}});
  router.post("/products/imports/:id/start", async (req,res)=>{try{const jobId=Number(req.params.id);if(!Number.isInteger(jobId)||jobId<=0)throw new Error("Invalid import job id.");const job=await loadJob(jobId);if(!job)throw new Error("Import job not found.");if(Number(job.invalid_rows||0)>0)throw importValidationError("Fix invalid rows before starting the import.");const actor=req.user||{};await pool.query(`UPDATE product_import_jobs SET options=$2::jsonb WHERE id=$1`,[jobId,JSON.stringify(req.body||{})]);startBackgroundJob(jobId,actor);res.status(202).json({job:serializeJob(await loadJob(jobId)),message:"Import started."});}catch(error){const status=error?.statusCode||400;res.status(status).json({error:error instanceof Error?error.message:String(error)});}});
  router.get("/products/imports", async (_req,res)=>{await ensureSchema();const {rows}=await pool.query(`SELECT * FROM product_import_jobs ORDER BY created_at DESC LIMIT 50`);res.json({data:rows.map(serializeJob)});});
  router.get("/products/imports/:id", async (req,res)=>{const job=await loadJob(Number(req.params.id));if(!job){res.status(404).json({error:"Import job not found"});return;}const result=await loadJobRows(Number(req.params.id),req.query||{});res.json({job:serializeJob(job),...result});});
  router.post("/products/imports/:id/remap", async (req,res)=>{try{const job=await loadJob(Number(req.params.id));if(!job)throw new Error("Import job not found");await remapJob(job.id,req.body?.mapping||{});res.json({job:serializeJob(await loadJob(job.id))});}catch(error){res.status(error?.statusCode||400).json({error:error instanceof Error?error.message:String(error)});}});
  router.get("/products/imports/template", async (_req,res)=>{const csv=TEMPLATE_HEADERS.map(csvEscape).join(",")+"\n";res.type("text/csv").set("Content-Disposition","attachment; filename=products-import-template.csv").send(csv);});
  router.get("/products/imports/:id/export", async (req,res)=>{try{const job=await loadJob(Number(req.params.id));if(!job){res.status(404).json({error:"Import job not found"});return;}const result=await loadJobRows(job.id,{page:1,limit:200});const rows=result.rows||[];const header=["Row","Product Code","Barcode","Product Name","Category","Brand","Unit","Cost Price","Selling Price","VAT","Reorder Level","Opening Stock","Supplier","Location","Description","Status","Errors"];const lines=[header.map(csvEscape).join(",")];for(const row of rows){const d=safeJson(row.normalized_data,{});lines.push([row.row_number,d.product_code,d.barcode,d.product_name,d.category,d.brand,d.unit,d.cost_price,d.selling_price,d.vat_rate,d.min_stock,d.current_stock,d.supplier,d.location,d.description,row.status,JSON.stringify(safeJson(row.validation_errors,[]))].map(csvEscape).join(","));}res.type("text/csv").set("Content-Disposition",`attachment; filename=product-import-${job.id}.csv`).send(lines.join("\n"));}catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post("/products/imports/:id/undo", async (req,res)=>{res.status(501).json({error:"Undo is not enabled in this runtime yet."});});
  router.post("/products/imports/barcodes", async (req,res)=>{try{const ids=requireProductIds(req.body);const branchId=await resolveWriteBranchId(req);const products=await fetchProductsForIds(ids,branchId);res.json({data:products});}catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post("/products/imports/barcodes/all", async (req,res)=>{try{const branchId=await resolveWriteBranchId(req);res.json({data:await fetchAllProducts(branchId)});}catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)});}});

  return router;
}

module.exports = { createProductBulkRouter, TEMPLATE_HEADERS, FIELD_LABELS };
