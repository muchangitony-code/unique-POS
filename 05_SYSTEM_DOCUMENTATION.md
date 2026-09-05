# UniquePOS — Technical System Documentation

UniquePOS is a self-hostable **ERP + Point of Sale** system for retail/wholesale
businesses, with multi-branch support. It is a single Node.js application that
serves a REST API and a React web frontend, backed by PostgreSQL.

---

## 1. Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Backend | Express (TypeScript), bundled to a single CommonJS file for deployment |
| ORM / DB access | Drizzle ORM + `pg` (node-postgres) |
| Database | PostgreSQL |
| Auth | JWT (signed with `SESSION_SECRET`), bcrypt password hashing, optional 2FA |
| Frontend | React + Vite (compiled to static assets, served by the API process) |
| PDF generation | pdfkit (reports, documents) |
| Email | nodemailer (SMTP) |
| Logging | pino (+ pino-pretty) |
| File storage | Local disk (branding images) in the standalone build |
| Backups | `pg_dump` / `psql` to local disk |

---

## 2. High-level architecture

```
                    ┌──────────────────────────────────────┐
   Browser  ─────►  │  Node.js process (Passenger/app.js)   │
   (React SPA)      │                                        │
                    │  Express router                        │
                    │   ├── /            → static frontend    │
                    │   ├── /api/*       → REST API           │
                    │   │     └── conditionalAuth (JWT)       │
                    │   └── /api/storage/objects/* → files    │
                    │                                        │
                    │  Local disk:  storage/  backups/       │
                    └───────────────┬───────────────────────┘
                                    │  SQL (pg)
                                    ▼
                        PostgreSQL (managed, remote)
```

- **Single process:** the same Express app serves the SPA (`/`) and the API
  (`/api/*`). Static assets and the SPA fallback are handled before auth so the
  app shell loads without a token; API routes require a valid JWT.
- **Auth:** `conditionalAuth` middleware protects all routes except a small
  allow-list (login, health, static assets, signed upload URLs).
- **Multi-branch:** data is branch-aware; an optional `x-branch-id` header lets
  a super-admin view/act within a specific branch. See `07_MULTI_BRANCH.md`.

---

## 3. Feature overview

### Point of Sale
- Fast sale entry, barcode scanning, multiple payment methods.
- Stock decrements atomically on sale.
- Sales history and per-sale detail.

### Inventory
- Products with SKU, barcode, pricing, and cost.
- Per-branch stock quantities (`product_stock`).
- Stock movements ledger (every change recorded).
- Receive stock, adjust stock (with below-zero warnings).
- Cross-branch **stock transfers** with hold/approve/reject workflow.
- Bulk **barcode generation** for products (without overwriting existing codes).
- Live stock count as you pick products on Receive/Adjust forms.

### Catalogue
- Products, Categories, Brands, Suppliers, Customers (with ledgers).

### Sales documents
- **Quotations** (`QTN-`) and **Invoices** (`INV-`) via a shared multi-step
  wizard, per-year sequential numbering, and PDF export.
- Convert a quotation to an invoice; record invoice payments.
- Sales staff can create quotations/invoices without full inventory access.

### Purchasing & expenses
- Purchase orders with receiving; business expenses tracking.

### Reporting
- Dashboard stats, sales chart, top products, recent transactions.
- Sales summary, profit & loss, inventory valuation, and **branch comparison**
  (super-admin) reports. PDF export with page/row summaries.

### Administration & security
- **Users** with roles and optional 2FA; account lockout on repeated failures.
- **Audit Log** of all mutations (actor/entity/before-after), with filters,
  CSV and PDF export.
- **Login History** and **Security Alerts** (configurable rule engine; email
  notifications; in-app notification bell).
- **Backups**: on-demand and scheduled database backups, download, restore, and
  email notifications.
- **Settings**: company info, branding (logo/stamp/signature), payment, SMTP,
  and security configuration.

### Mobile companion (separate artifact, not part of the cPanel build)
- An Expo/React Native POS app exists in the repo (`artifacts/mobile-pos`) with
  barcode scanning and offline sale queuing. It is **excluded** from the
  standalone web deployment.

---

## 4. Folder structure

### The deployment package (`uniquepos-standalone.zip`)
```
uniquepos/
├── app.js              # Passenger startup file (CommonJS, no top-level await)
├── package.json        # runtime deps only; start = node app.js
├── server/
│   ├── index.cjs       # entire backend bundled into one CommonJS file
│   ├── pino-*.cjs      # pino transport workers
│   └── *.map           # source maps
├── public/             # compiled React frontend (index.html + assets/)
├── db/
│   └── database.sql    # schema + starter data (pg_dump)
├── storage/            # uploaded branding images (created/written at runtime)
├── backups/            # database backups created in-app
├── .env.example        # environment template
└── README.md
```

### The source repository (monorepo)
```
artifacts/
├── api-server/         # backend (Express + Drizzle, TypeScript)
│   ├── src/
│   │   ├── app.ts              # Express app: middleware, static, auth, routes
│   │   ├── index.ts           # entrypoint: migrations → listen → scheduler
│   │   ├── routes/            # one file per resource (see API reference)
│   │   └── lib/               # db, auth, storage, backup, scheduler, alerts…
│   ├── build.mjs              # normal (Replit) build
│   └── build-standalone.mjs   # standalone cPanel/Passenger builder
├── unique-pos/         # web frontend (React + Vite)
│   └── src/pages/             # dashboard, pos, products, inventory, …
├── mobile-pos/         # Expo mobile app (NOT in the web deploy)
└── mockup-sandbox/     # design sandbox (NOT in the web deploy)
```

---

## 5. API reference

All endpoints are under the `/api` prefix and (except the public ones) require
an `Authorization: Bearer <token>` header obtained from `POST /api/auth/login`.

### Auth
- `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- `POST /auth/forgot-password` · `POST /auth/reset-password` · `POST /auth/change-password`
- `GET /auth/2fa/status` · `POST /auth/2fa/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable`

### Catalogue
- Products: `GET/POST /products`, `GET/PATCH/DELETE /products/:id`,
  `PATCH /products/generate-barcodes`, `GET /products/barcode/:barcode`
- Categories: `GET/POST /categories`, `GET/PATCH/DELETE /categories/:id`
- Brands: `GET/POST /brands`, `PATCH/DELETE /brands/:id`
- Suppliers: `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id`
- Customers: `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id`,
  `GET /customers/:id/ledger`

### Sales & POS
- `POST /pos/sale`, `GET /pos/sales`, `GET /pos/sales/:id`

### Inventory
- `GET /inventory/movements` · `POST /inventory/receive` · `POST /inventory/adjust`
- `GET /inventory/stock-count`
- Transfers: `GET/POST /inventory/transfers`,
  `POST /inventory/transfers/:id/approve`, `POST /inventory/transfers/:id/reject`

### Documents
- Quotations: `GET/POST /quotations`, `GET/PATCH/DELETE /quotations/:id`,
  `POST /quotations/:id/convert`
- Invoices: `GET/POST /invoices`, `GET/PATCH /invoices/:id`, `POST /invoices/:id/pay`
- Purchases: `GET/POST /purchases`, `GET/PATCH /purchases/:id`, `POST /purchases/:id/receive`
- Expenses: `GET/POST /expenses`, `GET/PATCH/DELETE /expenses/:id`

### Branches
- `GET /branches`, `GET /branches/options`, `GET /branches/:id`,
  `POST /branches`, `PATCH /branches/:id`, `DELETE /branches/:id`

### Reports & dashboard
- `GET /dashboard/stats` · `/dashboard/recent-transactions` · `/dashboard/sales-chart` · `/dashboard/top-products`
- `GET /reports/sales-summary` · `/reports/profit-loss` · `/reports/inventory-valuation` · `/reports/branch-comparison`

### Users, settings & security
- Users: `GET/POST /users`, `GET/PATCH/DELETE /users/:id`
- Settings: `GET /settings`, `GET /settings/branding`, `PATCH /settings`,
  `PATCH /settings/branding`, `PATCH /settings/payment`, `PATCH /settings/security`
- Security: `GET /security/login-history`
- Audit log: `GET /audit-log`, `/audit-log/actions`, `/audit-log/export`, `/audit-log/export-pdf`
- Notifications: `GET /notifications`, `/notifications/all`,
  `PATCH /notifications/read-all`, `PATCH /notifications/:id/read`, `DELETE /notifications`

### Backups (admin)
- `GET /admin/backups`, `/admin/backups/status`
- `POST /admin/backups/run`, `/admin/backups/test-email`
- `POST /admin/backups/:filename/restore`, `GET /admin/backups/:filename/download`
- `POST /admin/reset-transactional-data`

### Storage & health
- `GET /storage/objects/*` (serves uploaded branding images; signed uploads)
- `GET /health/healthz`

---

## 6. Data model summary

See `02_DATABASE_SETUP.md` for the full table list (26 tables). Key
relationships:

- `products` ↔ `product_stock` (per branch) ↔ `stock_movements` (ledger)
- `sales` → `sale_items` → `products`
- `invoices` → `invoice_items` + `invoice_payments`; `quotations` → `quotation_items`
- `purchases` → `purchase_items`
- `document_sequences` drives QTN-/INV- numbering per year
- `audit_log`, `login_history`, `admin_notifications` back the security features
- `branches` scopes stock, sales, and reporting

---

## 7. Maintenance procedures

### Routine
- **Backups:** schedule in-app backups (Settings/Backups) and/or rely on your
  managed Postgres provider's automatic backups. Copy `backups/` and `storage/`
  off-site regularly. See `06_BACKUP_RESTORE.md`.
- **Monitor logs:** check the Passenger/app logs periodically; set
  `LOG_LEVEL=debug` temporarily when diagnosing.
- **Security review:** review the Audit Log and Security Alerts; rotate
  `SESSION_SECRET` if compromise is suspected (forces re-login).

### Updating the app
1. Build a new `uniquepos-standalone.zip`.
2. Back up `.env`, `storage/`, `backups/`.
3. Upload/extract over the app folder (keep the backed-up folders).
4. **Run NPM Install**, then **Restart** in cPanel.
5. Schema upgrades apply automatically on boot (idempotent migrations).

### Scaling & performance
- Keep the database geographically close to the server.
- Use the provider's pooled connection endpoint.
- Add indexes for large datasets if reports slow down (products, sales by date,
  stock_movements by product/branch).

### Housekeeping
- Prune old backups from `backups/` once archived off-site.
- The `POST /admin/reset-transactional-data` endpoint clears transactional data
  (sales/inventory movements) for a clean start — use with extreme care and only
  after a verified backup.
