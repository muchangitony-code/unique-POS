---
name: UniquePOS quotations & invoices
description: How sales documents (quotations/invoices) number, total, and commit stock; shared wizard; known concurrency limits.
---

# Quotations & Invoices (sales documents)

## Numbering
- `nextDocumentNumber(docType)` + `document_sequences` table give per-year sequential codes: `QTN-YYYY-000001`, `INV-YYYY-000001`. Sequence row increment is atomic but is NOT tied into the document-insert transaction.

## Totals model (must stay mirrored)
Server `document-totals.ts` (`computeDocumentTotals`) and client `docCalc.ts` mirror each other — change both together or previews disagree with saved values.
- Per line: `afterDiscount = qty*price − discount%`; `lineTax = afterDiscount * vat%`.
- `subtotal` = Σ afterDiscount (ex-VAT); `taxAmount` = Σ lineTax.
- Manual discount is an **absolute** amount off the grand total.
- `discount_amount` returned = Σ(line discount) + manual discount.
- `total = subtotal + tax − manualDiscount`.

## Stock commit rules
- Quotation save: NEVER touches stock.
- Invoice POST: deducts stock only when status != "draft".
- Quotation→invoice convert: deducts stock, copies fields, guards already-converted (returns 409).
- Deduction = decrement `products.current_stock` + insert `stockMovementsTable` row (`type: "sale"`, negative qty, `reference` = invoice number).

## Known concurrency limitation (accepted, matches POS)
Stock uses read-modify-write (not atomic), no wrapping transaction, no negative-stock block — identical to `routes/pos.ts` sale flow. Consistent by design; hardening is a separate app-wide task (transactions + atomic `current_stock = current_stock - qty`). Not blocking negative stock aligns with product direction (warnings, not hard blocks).

## Access limitation
Product search + `/products/barcode/:code` (used by the wizard AND POS) require Administrator/Manager/Storekeeper tier — a pure Sales/Cashier user can open the wizard but can't load products. Pre-existing; fix would relax GET /products for sales_cashier.

## Roles
DB `user_role` enum: super_admin, business_owner, branch_manager, cashier, storekeeper, accountant, sales_rep, technician. `permissions.ts ROLE_TIER_MAP` folds these into 4 tiers (administrator/manager/sales_cashier/storekeeper). `requireRole` takes TIERS, not raw DB roles.
