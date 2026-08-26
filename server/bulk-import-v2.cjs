'use strict';

/**
 * Fresh Bulk Import V2 implementation.
 * This module is intentionally independent of every historical bulk-import
 * implementation. It owns only the new import contract and writes to the
 * current products/product_stock tables through the supplied database pool.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const readXlsxFile = require('read-excel-file/node');

const FIELDS = [
  'product_code', 'barcode', 'product_name', 'category', 'brand', 'unit',
  'cost_price', 'selling_price', 'vat_rate', 'reorder_level',
  'opening_stock', 'supplier', 'location', 'description', 'image_url'
];

const ALIASES = {
  product_code: ['productcode','productcodesku','sku','code','itemcode','productid'],
  barcode: ['barcode','barcodenumber','ean','upc'],
  product_name: ['productname','name','itemname'],
  category: ['category','categoryname','productcategory'],
  brand: ['brand','brandname','manufacturer'],
  unit: ['unit','uom','measure'],
  cost_price: ['costprice','cost','buyprice','purchaseprice'],
  selling_price: ['sellingprice','saleprice','price','retailprice','unitprice'],
  vat_rate: ['vat','vatrate','tax','taxrate'],
  reorder_level: ['reorderlevel','minimumstock','minstock','reorderqty'],
  opening_stock: ['openingstock','stock','currentstock','qty','quantity'],
  supplier: ['supplier','suppliername','vendor'],
  location: ['location','branch','branchcode','branchname','store'],
  description: ['description','details','notes'],
  image_url: ['imageurl','image','imagepath','photourl','pictureurl']
};

function key(value) { return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function text(value) { return String(value ?? '').trim(); }
function number(value) {
  if (value === null || value === undefined || text(value) === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function detectMapping(headers) {
  const result = {};
  for (const field of FIELDS) {
    const aliases = ALIASES[field] || [];
    const match = headers.find((header) => aliases.includes(key(header)));
    if (match) result[field] = match;
  }
  return result;
}

function normalizeRow(raw, mapping) {
  const value = (field) => text(raw[mapping[field]]);
  return {
    product_code: value('product_code'),
    barcode: value('barcode'),
    product_name: value('product_name'),
    category: value('category'),
    brand: value('brand'),
    unit: value('unit') || 'pcs',
    cost_price: number(value('cost_price')),
    selling_price: number(value('selling_price')),
    vat_rate: number(value('vat_rate')) ?? 16,
    reorder_level: number(value('reorder_level')) ?? 0,
    opening_stock: number(value('opening_stock')) ?? 0,
    supplier: value('supplier'),
    location: value('location'),
    description: value('description'),
    image_url: value('image_url')
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
  return errors.map((message) => ({ row: rowNumber, message }));
}

function matrixToRecords(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return { headers: [], records: [] };
  const headers = matrix[0].map((value, i) => text(value) || `Column ${i + 1}`);
  const records = matrix.slice(1).map((cells, i) => {
    const raw = {};
    headers.forEach((header, index) => { raw[header] = cells[index] ?? ''; });
    return { rowNumber: i + 2, raw };
  }).filter(({ raw }) => Object.values(raw).some((value) => text(value)));
  return { headers, records };
}

function parseCsv(textValue) {
  const lines = String(textValue || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  return lines.map((line) => {
    const cells = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i]; const n = line[i + 1];
      if (c === '"') { if (quoted && n === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
      else if (c === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; }
      else cell += c;
    }
    cells.push(cell.trim());
    return cells;
  });
}

async function parseFile(buffer, fileName) {
  const extension = path.extname(text(fileName)).toLowerCase();
  if (extension === '.csv' || extension === '.txt') return parseCsv(buffer.toString('utf8'));
  if (extension === '.xlsx' || extension === '.xls') return readXlsxFile(buffer);
  throw new Error('Unsupported file. Use CSV, XLSX or XLS.');
}

function buildPreview(matrix) {
  const { headers, records } = matrixToRecords(matrix);
  const mapping = detectMapping(headers);
  const rows = records.map(({ rowNumber, raw }) => {
    const normalized = normalizeRow(raw, mapping);
    return { rowNumber, raw, normalized, errors: validateRow(normalized, rowNumber) };
  });
  return { headers, mapping, rows, total: rows.length, valid: rows.filter((row) => !row.errors.length).length, invalid: rows.filter((row) => row.errors.length).length };
}

async function importRows({ pool, rows, branchId, userId }) {
  if (!pool) throw new Error('Database pool is required');
  if (!branchId) throw new Error('A branch must be selected before importing products');
  const client = await pool.connect();
  const result = { created: 0, updated: 0, skipped: 0 };
  try {
    await client.query('BEGIN');
    for (const item of rows) {
      const row = item.normalized || item;
      const errors = validateRow(row, item.rowNumber || 0);
      if (errors.length) { result.skipped += 1; continue; }
      let product = null;
      if (row.product_code) {
        const found = await client.query('SELECT id FROM products WHERE product_code = $1 LIMIT 1', [row.product_code]);
        product = found.rows[0] || null;
      }
      if (!product && row.barcode) {
        const found = await client.query('SELECT id FROM products WHERE barcode = $1 LIMIT 1', [row.barcode]);
        product = found.rows[0] || null;
      }
      const fields = [row.product_code || null, row.barcode || null, row.product_name, row.category || null, row.brand || null, row.unit, row.cost_price ?? 0, row.selling_price, row.vat_rate ?? 16, row.reorder_level ?? 0, row.supplier || null, row.location || null, row.description || null, row.image_url || null];
      if (product) {
        await client.query(`UPDATE products SET product_code=$1, barcode=$2, product_name=$3, category=$4, brand=$5, unit=$6, cost_price=$7, selling_price=$8, vat_rate=$9, reorder_level=$10, supplier=$11, location=$12, description=$13, image_url=$14, updated_at=NOW() WHERE id=$15`, [...fields, product.id]);
        result.updated += 1;
      } else {
        const inserted = await client.query(`INSERT INTO products (product_code, barcode, product_name, category, brand, unit, cost_price, selling_price, vat_rate, reorder_level, supplier, location, description, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, fields);
        product = inserted.rows[0];
        result.created += 1;
      }
      await client.query(`INSERT INTO product_stock (product_id, branch_id, current_stock) VALUES ($1,$2,$3) ON CONFLICT (product_id, branch_id) DO UPDATE SET current_stock=EXCLUDED.current_stock`, [product.id, branchId, row.opening_stock ?? 0]);
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { FIELDS, detectMapping, normalizeRow, validateRow, parseCsv, parseFile, buildPreview, importRows };
