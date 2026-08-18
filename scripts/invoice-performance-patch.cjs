'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeBundle = path.join(root, 'index.runtime.cjs');

if (!fs.existsSync(runtimeBundle)) {
  throw new Error(`Invoice performance patch: missing ${runtimeBundle}`);
}

let source = fs.readFileSync(runtimeBundle, 'utf8');
const marker = 'const data = await Promise.all(rows.map(formatInvoice));';

if (!source.includes(marker)) {
  if (source.includes('const customerIds = rows.map((invoice) => invoice.customerId).filter((id) => id != null);')) {
    console.log('[build] Invoice list performance patch already applied');
    process.exit(0);
  }
  throw new Error('Invoice performance patch: invoice list formatter not found');
}

const replacement = `const customerIds = rows.map((invoice) => invoice.customerId).filter((id) => id != null);
  const customers = customerIds.length ? await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, customerIds)) : [];
  const customerMap = Object.fromEntries(customers.map((customer) => [customer.id, customer.name]));
  const data = rows.map((invoice) => ({
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    branch_id: invoice.branchId,
    customer_id: invoice.customerId,
    customer_name: invoice.customerId ? customerMap[invoice.customerId] ?? null : null,
    items: [],
    subtotal: Number(invoice.subtotal),
    discount_amount: Number(invoice.discountAmount),
    tax_amount: Number(invoice.taxAmount),
    total: Number(invoice.total),
    amount_paid: Number(invoice.amountPaid),
    balance_due: Number(invoice.balanceDue),
    status: invoice.status,
    due_date: invoice.dueDate,
    notes: invoice.notes,
    created_at: invoice.createdAt
  }));`;

source = source.replace(marker, replacement);
fs.writeFileSync(runtimeBundle, source, 'utf8');
console.log('[build] Invoice list endpoint optimized: summary rows no longer load every invoice item/product');
