---
name: Branch comparison report
description: How the side-by-side branch comparison report is structured
---

# Branch comparison report

`GET /reports/branch-comparison?from=&to=` (super-admin only via `requireSuperAdmin`)
returns every active branch side by side: sales, transactions, cogs, gross/net profit,
expenses, and stock cost/selling value.

**Design decisions:**
- It deliberately **ignores** the active branch scope (`x-branch-id`) — it always reports
  all active branches so the whole company can be compared.
- Sales, COGS, expenses, and stock are computed as **separate grouped queries** keyed by
  `branchId`, then merged in memory. **Why:** joining them into one aggregate multiplies rows
  and corrupts the sums. This mirrors the existing profit-loss report's COGS-separation pattern.
- Money metrics are filtered to `[from, to]`; **stock value is a point-in-time snapshot**
  (like inventory-valuation), not date-filtered.
- COGS uses the product's **current** cost price (same limitation as profit-loss) — historical
  profit shifts if costs change later. Fixing that needs cost-at-sale-time storage.

Frontend: super-admin-only "Branch Comparison" tab in `reports.tsx` (bar chart + table + totals).
Non-super users never see the tab and the query is disabled for them.
