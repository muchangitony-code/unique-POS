'use strict';
const path = require('node:path');
const { readSheet } = require('read-excel-file/node');

const FIELDS = [
  'product_code','barcode','product_name','category','brand','unit','cost_price',
  'selling_price','vat_rate','reorder_level','opening_stock','supplier','location','description'
];
const ALIASES = {
  product_code:['productcode','productcodesku','sku','code','itemcode','productid'],
  barcode:['barcode','barcodenumber','ean','upc'],
  product_name:['productname','name','itemname','description'],
  category:['category','categoryname','productcategory'],
  brand:['brand','brandname','manufacturer'],
  unit:['unit','uom','measure'],
  cost_price:['costprice','cost','buyprice','buyingprice','purchaseprice','buyingcost'],
  selling_price:['sellingprice','saleprice','price','retailprice','unitprice'],
  vat_rate:['vat','vatrate','tax','taxrate'],
  reorder_level:['reorderlevel','minimumstock','minstock','reorderqty'],
  opening_stock:['openingstock','stock','currentstock','qty','quantity','openingqty'],
  supplier:['supplier','suppliername','vendor'],
  location:['location','branch','branchcode','branchname','store'],
  description:['description','details','notes']
};

const key = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
const text = v => String(v ?? '').trim();
function number(v) {
  if (v === null || v === undefined || text(v) === '') return null;
  const n = Number(String(v).replace(/,/g,'').trim());
  return Number.isFinite(n) ? n : null;
}
function detectMapping(headers) {
  const out = {};
  for (const field of FIELDS) {
    const aliases = ALIASES[field] || [];
    const match = headers.find(h => aliases.includes(key(h)));
    if (match) out[field] = match;
  }
  return out;
}
function generateProductCode({ rowNumber=0, productName='', seed='' }={}) {
  const slug = text(productName).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,18) || 'PRODUCT';
  const suffix = String(seed || `${Date.now().toString(36)}-${rowNumber}`).toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(-12);
  return `US-${slug}-${suffix}`;
}
function normalizeRow(raw, mapping, {rowNumber=0, autoGenerateCode=false, codeSeed=''}={}) {
  const value = field => text(raw[mapping[field]]);
  const productName = value('product_name');
  const suppliedCode = value('product_code');
  const generatedCode = !suppliedCode && autoGenerateCode
    ? generateProductCode({rowNumber, productName, seed:`${codeSeed}-${rowNumber}`}) : '';
  return {
    product_code: suppliedCode || generatedCode,
    barcode: value('barcode'), product_name: productName,
    category: value('category'), brand: value('brand'), unit: value('unit') || 'pcs',
    cost_price: number(value('cost_price')), selling_price: number(value('selling_price')),
    vat_rate: number(value('vat_rate')) ?? 16, reorder_level: number(value('reorder_level')) ?? 0,
    opening_stock: number(value('opening_stock')) ?? 0, supplier: value('supplier'),
    location: value('location'), description: value('description')
  };
}
function validateRow(row, rowNumber) {
  const errors = [];
  if (!row.product_name) errors.push('Product Name is required');
  if (!row.product_code && !row.barcode) errors.push('Product Code/SKU or Barcode is required');
  if (row.selling_price === null || row.selling_price < 0) errors.push('Selling Price must be a valid non-negative number');
  if (row.cost_price !== null && row.cost_price < 0) errors.push('Cost Price must be non-negative');
  if (row.vat_rate < 0) errors.push('VAT must be non-negative');
  if (row.reorder_level < 0) errors.push('Reorder Level must be non-negative');
  if (row.opening_stock < 0) errors.push('Opening Stock must be non-negative');
  return errors.map(message => ({row: rowNumber, message}));
}
function matrixToRecords(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return {headers:[], records:[]};
  if (!Array.isArray(matrix[0]) && matrix[0] && typeof matrix[0] === 'object') {
    const headers = Object.keys(matrix[0]).map((h,i) => text(h) || `Column ${i+1}`);
    const records = matrix.map((row,i) => {
      const raw = {}; headers.forEach(h => { raw[h] = row[h] ?? ''; });
      return {rowNumber:i+2, raw};
    }).filter(x => Object.values(x.raw).some(v => text(v)));
    return {headers, records};
  }
  if (!Array.isArray(matrix[0])) throw new Error('The Excel file could not be read as a table. Please save it as .xlsx and try again.');
  const headers = matrix[0].map((v,i) => text(v) || `Column ${i+1}`);
  const records = matrix.slice(1).map((cells,i) => {
    const raw = {}; headers.forEach((h,j) => { raw[h] = cells[j] ?? ''; });
    return {rowNumber:i+2, raw};
  }).filter(x => Object.values(x.raw).some(v => text(v)));
  return {headers, records};
}
function parseCsv(value) {
  const lines = String(value || '').replace(/\r\n?/g,'\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  return lines.map(line => {
    const out=[]; let cell='', quoted=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i], next=line[i+1];
      if (ch === '"') { if (quoted && next === '"') { cell+='"'; i++; } else quoted=!quoted; }
      else if (ch === delimiter && !quoted) { out.push(cell.trim()); cell=''; }
      else cell += ch;
    }
    out.push(cell.trim()); return out;
  });
}
async function parseFile(buffer, fileName) {
  const ext = path.extname(text(fileName)).toLowerCase();
  if (ext === '.csv' || ext === '.txt') return parseCsv(buffer.toString('utf8'));
  if (ext === '.xlsx' || ext === '.xls') {
    const first = await readSheet(buffer);
    const firstMap = detectMapping(matrixToRecords(first).headers);
    if (firstMap.product_name && firstMap.selling_price) return first;
    for (const sheetName of ['Products','Product','Inventory','Catalogue','Catalog']) {
      try {
        const candidate = await readSheet(buffer,{sheet:sheetName});
        const candidateMap = detectMapping(matrixToRecords(candidate).headers);
        if (candidateMap.product_name && candidateMap.selling_price) return candidate;
      } catch {}
    }
    return first;
  }
  throw new Error('Unsupported file. Use CSV, XLSX or XLS.');
}
function buildPreview(matrix,{autoGenerateCodes=true}={}) {
  const {headers,records} = matrixToRecords(matrix);
  const mapping = detectMapping(headers);
  const seed = Date.now().toString(36);
  const rows = records.map(({rowNumber,raw}) => {
    const normalized = normalizeRow(raw,mapping,{rowNumber,autoGenerateCode:autoGenerateCodes,codeSeed:seed});
    return {
      rowNumber, raw, normalized,
      generated_product_code: autoGenerateCodes && !text(raw[mapping.product_code]) ? normalized.product_code : null,
      errors: validateRow(normalized,rowNumber)
    };
  });
  return {headers,mapping,rows,total:rows.length,valid:rows.filter(r=>!r.errors.length).length,invalid:rows.filter(r=>r.errors.length).length,auto_generated_codes:rows.filter(r=>r.generated_product_code).length};
}

// Match a no-SKU/no-barcode import against the existing clean catalogue by
// product name and selling price. This is important for the user's legacy
// stock workbook (name / quantity / price): re-importing it must UPDATE the
// existing products and stock, never create a second catalogue.
async function findExistingByNameAndPrice(client, row) {
  if (!row.product_name || row.barcode) return null;
  const params = [row.product_name];
  let where = 'LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_active = TRUE';
  if (row.selling_price !== null && row.selling_price !== undefined) {
    params.push(row.selling_price);
    where += ` AND selling_price = $${params.length}`;
  }
  const result = await client.query(`SELECT id, sku FROM inventory_products_v2 WHERE ${where} ORDER BY id LIMIT 2`, params);
  return result.rows.length === 1 ? result.rows[0] : null;
}

async function importRows({pool,rows,branchId,userId}) {
  if (!pool) throw new Error('Database pool is required');
  if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) throw new Error('A valid branch is required');
  const client = await pool.connect();
  const result = {created:0,updated:0,skipped:0,generatedCodes:0,nameMatched:0};
  try {
    await client.query('BEGIN');
    for (const item of rows) {
      const r = {...(item.normalized || item)};
      const generated = text(item.generated_product_code);
      let p = null;

      if (r.product_code && !generated) {
        const q = await client.query('SELECT id, sku FROM inventory_products_v2 WHERE sku=$1 LIMIT 1',[r.product_code]);
        p = q.rows[0] || null;
      }
      if (!p && r.barcode) {
        const q = await client.query('SELECT id, sku FROM inventory_products_v2 WHERE barcode=$1 LIMIT 1',[r.barcode]);
        p = q.rows[0] || null;
      }
      if (!p && generated) p = await findExistingByNameAndPrice(client,r);

      if (p && generated) result.nameMatched++;
      if (!p && !r.product_code && !r.barcode) {
        r.product_code = generated || generateProductCode({rowNumber:item.rowNumber,productName:r.product_name,seed:`${Date.now().toString(36)}-${item.rowNumber}`});
        result.generatedCodes++;
      }
      const errors = validateRow(r,item.rowNumber || 0);
      if (errors.length) { result.skipped++; continue; }

      const skuForWrite = p ? p.sku : r.product_code;
      const fields = [skuForWrite,r.barcode||null,r.product_name,r.category||null,r.brand||null,r.unit||'pcs',r.cost_price??0,r.selling_price,r.vat_rate??16,r.reorder_level??0,r.supplier||null,r.description||null];
      if (p) {
        await client.query(`UPDATE inventory_products_v2 SET sku=$1,barcode=$2,name=$3,category=$4,brand=$5,unit=$6,cost_price=$7,selling_price=$8,vat_rate=$9,reorder_level=$10,supplier=$11,description=$12,is_active=TRUE,updated_at=NOW() WHERE id=$13`,[...fields,p.id]);
        result.updated++;
      } else {
        const q = await client.query(`INSERT INTO inventory_products_v2(sku,barcode,name,category,brand,unit,cost_price,selling_price,vat_rate,reorder_level,supplier,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,fields);
        p = q.rows[0]; result.created++;
      }
      await client.query(`INSERT INTO inventory_stock_v2(product_id,branch_id,quantity_on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,branch_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand,updated_at=NOW()`,[p.id,Number(branchId),r.opening_stock??0]);
      if (Number(r.opening_stock||0) !== 0) {
        await client.query(`INSERT INTO inventory_movements_v2(product_id,branch_id,movement_type,quantity_delta,reason,user_id) VALUES($1,$2,'opening_balance',$3,'Bulk Import V2',$4)`,[p.id,Number(branchId),r.opening_stock,userId||null]);
      }
    }
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

module.exports={FIELDS,ALIASES,detectMapping,generateProductCode,normalizeRow,validateRow,parseCsv,parseFile,buildPreview,importRows};
