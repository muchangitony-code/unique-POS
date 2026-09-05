---
name: UniquePOS multi-branch architecture
description: How branch scoping works across the ERP — data model, JWT scoping, and stock-per-branch source of truth.
---

# Multi-branch scoping

UniquePOS supports multiple branches with a **shared product catalog** but **per-branch stock levels**.

## Source of truth for stock
- `product_stock` (branchId, productId → cur qty + optional per-branch min) is the source of truth.
- `products.currentStock` / `products.minStock` are **legacy** — do NOT read them for stock decisions. All reads go through `lib/stock.ts` (`loadStockMap`, `getBranchCurrentStock`, `adjustBranchStock`).
- Any new report/dashboard that needs stock must use `loadStockMap({ branchId, all })`, never `products.currentStock`.

## Scoping model (JWT-driven)
- JWT carries the user's branch id. Non-super users are hard-locked to their own branch.
- Super admins default to **all** mode (no header → sees everything, backward compatible) or focus one branch via `x-branch-id` header / `branch_id` query param.
- The branch WHERE condition is three-valued: omit-the-filter (super all-mode), match-nothing / `false` (non-super with no branch — fail-closed reads), or equals-branch. When combining with date/status filters, drop the omitted (undefined) condition before `and(...)`.

**Why:** existing frontend sent no branch header, so "all mode for super + no filter" keeps pre-branch behavior working while everything resolves to Main Branch.

## Ownership guards & fail-closed writes
- Lists filter by the branch condition; detail/update/delete fetch-first then 404 if out of scope; creates stamp the resolved branch.
- **Write resolver must fail closed:** a non-super user with no assigned branch is DENIED (403), never defaulted to Main Branch. Reads were already fail-closed, but an early version let unassigned writes fall through to the default branch — a broken-access-control hole. Only super admins may fall back to the default branch.
- Thrown branch-scope errors carry an HTTP `status`; a global express error handler maps it (403/500) instead of a bare 500.

## branch_id nullability
- notNull on transactional tables (sales, invoices, quotations, purchases, expenses, customers, suppliers, stock_movements, product_stock).
- nullable on `users` and `audit_log` (system events have no branch). A single-branch WHERE `eq(branchId, B)` therefore hides null-branch audit rows from branch managers — accepted.

## Migration mechanism
- `startup-migrations.ts`: idempotent DDL (CREATE/ALTER IF NOT EXISTS) on every boot, plus a one-time `runOnce(...)` gated on `data_migrations` that creates Main Branch (code MAIN), copies company payment/contact fields from business_settings, backfills branch_id everywhere, backfills product_stock from products, then SET NOT NULL on transactional tables.

## Branch deletion
- `routes/branches.ts` DELETE refuses (409) if the branch owns any records in the transactional tables → deactivate (`is_active=false`) instead so historical documents keep their reference. Writes gated by `requireSuperAdmin`; GET readable by any authenticated user (non-super sees only own branch).
