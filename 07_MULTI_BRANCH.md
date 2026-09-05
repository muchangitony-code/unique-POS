# UniquePOS — Multi-Branch Deployment (One Central Database)

UniquePOS is branch-aware. You run **one application instance** and **one central
PostgreSQL database**, and all branches share it. Stock, sales, and reports are
scoped per branch, while catalogue, customers, and settings are shared.

This is the recommended topology: it keeps inventory and reporting consistent
across every location in real time.

---

## 1. How branch scoping works

- The `branches` table holds each physical location.
- Stock is tracked **per branch** in `product_stock`; every change is recorded in
  `stock_movements` with its branch.
- Sales, transfers, and branch reports carry a branch reference.
- Each **user** belongs to a branch (their default operating branch). Normal
  staff operate within their branch automatically.
- A **super-admin** can view or act within a specific branch by sending an
  `x-branch-id` header; the web app sets this when an admin switches the active
  branch in the UI. If no branch context is provided, queries run unscoped
  (all-branch view for admins).
- **Cross-branch stock transfers** move inventory between locations using a
  hold → approve/reject workflow, so stock is never double-counted.

Because everything points at the same database, a sale in Branch A and a sale in
Branch B update the same shared catalogue and the same central reports instantly.

---

## 2. Recommended topology

```
        Branch A (tills/PCs)  ┐
        Branch B (tills/PCs)  ┤   HTTPS
        Branch C (tills/PCs)  ┘     │
                                    ▼
                    ┌─────────────────────────────┐
                    │  One UniquePOS app instance  │  (Truehost cPanel)
                    │  https://pos.yourdomain.com  │
                    └──────────────┬──────────────┘
                                   │  SQL
                                   ▼
                     One central PostgreSQL database
```

Every branch simply opens the same URL in a browser and logs in. There is
nothing to install per till beyond a web browser (and, optionally, the mobile
app or a barcode scanner).

---

## 3. Setup steps

1. **Deploy once** following `01_DEPLOYMENT_TRUEHOST.md` (one app, one
   `DATABASE_URL`).
2. **Create the branches:** log in as admin → Branches → add each location
   (name, address, and branch-specific details used on documents).
3. **Create users per branch:** Settings → Users. Assign each staff member to
   their branch and role. Give managers the appropriate access; reserve
   super-admin for head office.
4. **Set opening stock per branch:** use **Inventory → Receive** at each branch
   to enter starting quantities (stock is per branch).
5. **Configure branch identity on documents:** invoices/quotations show the
   owning branch's identity, falling back to company defaults for any blank
   field — so each branch's documents show the right address/contact.

---

## 4. Day-to-day multi-branch operations

- **Selling:** staff sell within their branch; stock decrements for that branch.
- **Transfers:** move stock between branches via Inventory → Transfers
  (request at the source, approve at the destination). Stock only moves once the
  transfer is approved, and the operation is protected against partial failure.
- **Reporting:** use **Reports → Branch comparison** (super-admin) to compare
  performance across branches; other reports can be viewed per branch or overall.
- **Head-office view:** a super-admin can switch the active branch in the UI to
  drill into a single location, or view all branches together.

---

## 5. Access, security, and consistency

- Keep the number of super-admins small; they can see and act across all
  branches.
- Every mutation is captured in the **Audit Log** with the actor and branch, so
  cross-branch activity is traceable.
- Because there is a single database, stock counts stay consistent even when
  multiple branches sell simultaneously (sales apply stock changes atomically).

---

## 6. Networking notes

- All branches connect over the public internet to the same HTTPS URL — no VPN
  is required. Ensure the site is served over TLS (cPanel AutoSSL / Let's
  Encrypt).
- Keep the central database in a region reasonably close to your branches to
  minimise latency; use the provider's pooled connection endpoint.
- For unreliable branch internet, use the **mobile app's offline sale queue**
  (queues sales locally and syncs when back online) — note the mobile app is a
  separate artifact, not part of the web deployment. Full offline support for the
  web POS is on the roadmap (`08_ROADMAP.md`).

---

## 7. What is shared vs. per-branch

| Shared across branches | Per branch |
|---|---|
| Product catalogue, categories, brands | Stock quantity (`product_stock`) |
| Customers, suppliers | Sales & sale history |
| Company settings, SMTP, security | Stock movements ledger |
| User accounts (assigned to a branch) | Branch identity on documents |
| Document numbering sequences | Branch-scoped reports |

> A single central database is the intended and supported model. Running a
> separate database per branch is **not** recommended — it breaks cross-branch
> stock transfers, consolidated reporting, and shared catalogue consistency.
