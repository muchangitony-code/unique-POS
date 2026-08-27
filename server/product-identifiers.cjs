'use strict';

const IDENTIFIER_SEQUENCE = 'public.inventory_product_identifier_seq';
const MAX_ATTEMPTS = 100;

function text(value) {
  return String(value ?? '').trim();
}

function categoryPrefix(category) {
  const compact = text(category).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (compact.slice(0, 4) || 'PROD');
}

// Returns a structurally valid 13-digit EAN/GTIN check digit for the supplied
// 12-digit body. The generated range is for internal POS identification; it is
// not a GS1-assigned GTIN unless the business's GS1 prefix is used.
function ean13(body) {
  const value = text(body);
  if (!/^\d{12}$/.test(value)) throw new Error('EAN-13 body must contain exactly 12 digits.');
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return `${value}${(10 - (sum % 10)) % 10}`;
}

async function allocateProductIdentifiers(client, { sku, barcode, category }) {
  let finalSku = text(sku);
  let finalBarcode = text(barcode);
  const needsSku = !finalSku;
  const needsBarcode = !finalBarcode;

  if (!needsSku && !needsBarcode) return { sku: finalSku, barcode: finalBarcode };

  const prefix = categoryPrefix(category);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { rows } = await client.query(`SELECT nextval('${IDENTIFIER_SEQUENCE}')::BIGINT AS sequence`);
    const sequence = Number(rows[0].sequence);
    const generatedSku = `${prefix}-${String(sequence).padStart(6, '0')}`;
    const generatedBarcode = ean13(`2${String(sequence).padStart(11, '0')}`);

    const candidateSku = needsSku ? generatedSku : finalSku;
    const candidateBarcode = needsBarcode ? generatedBarcode : finalBarcode;
    const collision = await client.query(
      `SELECT 1
         FROM inventory_products_v2
        WHERE sku = $1
           OR (barcode IS NOT NULL AND btrim(barcode) <> '' AND barcode = $2)
        LIMIT 1`,
      [candidateSku, candidateBarcode]
    );

    if (!collision.rowCount) return { sku: candidateSku, barcode: candidateBarcode };
  }

  throw new Error('Unable to allocate a unique SKU and barcode.');
}

module.exports = { allocateProductIdentifiers, categoryPrefix, ean13 };
