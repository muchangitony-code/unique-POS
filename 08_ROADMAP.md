# UniquePOS — Feature Roadmap & Integration Plan

This roadmap covers the major features not yet in the system, with a practical
implementation plan for each. Priorities are suggested for a Kenyan retail
context (KRA compliance and mobile money first).

## Current state (baseline)

Already implemented:
- Core ERP + POS (products, stock, sales, purchases, expenses, customers).
- Quotations & invoices with PDF export.
- Multi-branch with cross-branch transfers.
- Bulk **barcode generation** for products and barcode **lookup** in POS.
- Reporting, audit log, security alerts, backups.
- Mobile app (separate artifact) with an **offline sale queue** that syncs on
  reconnect.

Not yet implemented (this roadmap):
1. KRA eTIMS integration
2. M-Pesa integration
3. Barcode **printing** (label output)
4. Receipt printer support
5. Offline synchronisation for the **web** POS

Suggested priority order: **M-Pesa → eTIMS → Receipt printing → Barcode label
printing → Web offline sync.**

---

## 1. KRA eTIMS integration (tax compliance)

**Goal:** transmit invoices/sales to KRA's eTIMS (electronic Tax Invoice
Management System) and print the KRA-compliant invoice (control unit number,
QR code, etc.).

**Approach**
- Use the **eTIMS OSCU/VSCU** API (Online/Virtual Sales Control Unit). Most
  self-hosted web apps integrate via the **VSCU** (software SCU) or the
  eTIMS **API** onboarding for authorised third parties.
- Register the business/device with KRA to obtain credentials (device serial,
  branch ID/`bhfId`, and API keys).

**Implementation steps**
1. Add a settings section (Settings → Tax/eTIMS) to store credentials and the
   PIN/branch identifiers (secrets in env, not the DB).
2. Create a server module `lib/etims.ts` that:
   - Registers/initialises the device (one-time).
   - On invoice finalisation, sends the sale payload (items, taxes, totals) and
     receives the SCU signature, invoice number, and QR data.
   - Handles item classification codes (KRA UNSPSC-style codes) — add a
     `kra_item_code` and tax type/rate to `products`.
3. Store the returned control data on the invoice (new columns:
   `etims_receipt_no`, `etims_signature`, `etims_qr`, `etims_status`).
4. Render the QR code and control number on the invoice/receipt PDF.
5. Add a retry queue for offline/failed transmissions (store pending, resend).

**Data model changes:** `products` (+tax code/rate), `invoices`/`sales`
(+eTIMS fields), a `etims_queue` table for retries.

**Effort:** Large (2–4 weeks incl. KRA sandbox testing). **Dependency:** KRA
onboarding/approval; sandbox credentials.

---

## 2. M-Pesa integration (mobile money)

**Goal:** accept M-Pesa payments at POS and reconcile them automatically.

**Approach — Safaricom Daraja API**
- **STK Push (Lipa na M-Pesa Online):** cashier enters amount + customer phone,
  customer approves the prompt on their phone.
- **C2B / callback:** confirm payment via Daraja callbacks; reconcile against
  the sale.

**Implementation steps**
1. Register a Daraja app to get Consumer Key/Secret, shortcode, and passkey
   (store as env secrets: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`,
   `MPESA_SHORTCODE`, `MPESA_PASSKEY`).
2. Server module `lib/mpesa.ts`:
   - OAuth token fetch/refresh.
   - `initiateStkPush(saleId, phone, amount)` → returns a `CheckoutRequestID`.
   - Public callback route `POST /api/payments/mpesa/callback` to receive the
     result (must be allow-listed in `conditionalAuth`, validated by
     shortcode/amount).
3. Add a `payments` / extend `invoice_payments` with `method='mpesa'`,
   `mpesa_receipt`, `checkout_request_id`, `status`.
4. POS UI: "Pay with M-Pesa" → shows pending → auto-completes on callback (poll
   or websocket). Fall back to manual receipt entry if the callback is delayed.
5. Reconciliation report: match M-Pesa receipts to sales.

**Effort:** Medium (1–2 weeks). **Dependency:** Daraja credentials; a public
HTTPS callback URL (your `APP_URL`).

---

## 3. Barcode label printing

**Goal:** print product barcode **labels** (the app already *generates* barcode
values; this adds physical label output).

**Approach**
- Generate barcode images (e.g. Code128/EAN-13) with a library such as
  `bwip-js` and lay them out on a label sheet or roll.
- Provide a **printable label PDF** (server-side via pdfkit) sized to common
  label stock, and/or a browser print view with CSS `@media print`.

**Implementation steps**
1. Add `GET /api/products/:id/label` and a bulk
   `POST /api/products/labels` (list of ids + label size) returning a PDF.
2. Server: render each product's barcode + name + price into label cells.
3. UI: from Products (and after bulk barcode generation), select items →
   "Print labels" → choose label size/template → download/print.
4. Support label-printer stock sizes (e.g. 40×30mm) and multi-per-page A4.

**Effort:** Small–Medium (3–5 days). **Dependency:** none (works with any
office/label printer).

---

## 4. Receipt printer support

**Goal:** print POS receipts to thermal receipt printers (58mm/80mm).

**Approach (two tiers)**
- **Tier 1 — browser print (works everywhere now):** a receipt HTML view styled
  for 58/80mm with `@media print`; the OS printer driver handles the thermal
  printer. Fastest to ship, no hardware SDK.
- **Tier 2 — ESC/POS direct:** for cash-drawer kick and precise formatting, use
  ESC/POS. Options: a small **local print agent** on the till (Node/Python) that
  the browser posts to, or WebUSB/WebSerial for supported printers, or
  network-attached printers via raw TCP (port 9100).

**Implementation steps**
1. Build a compact receipt template (logo, items, totals, tax, footer, and the
   eTIMS QR once §1 lands).
2. Tier 1: add a print-on-complete option in POS settings.
3. Tier 2: define an ESC/POS formatter and a documented local-agent contract, or
   a network-printer setting (IP + port) per till/branch.
4. Add per-branch/per-till printer settings.

**Effort:** Tier 1 small (2–3 days); Tier 2 medium (1–2 weeks incl. hardware
testing). **Dependency:** target printer models for ESC/POS testing.

---

## 5. Web offline synchronisation

**Goal:** let the **web** POS keep selling during internet outages and sync when
back online (the mobile app already queues offline sales; this brings parity to
the browser).

**Approach**
- Turn the frontend into a **PWA** with a service worker for the app shell and
  cached reference data (products/prices).
- Queue sales locally in **IndexedDB** while offline; on reconnect, replay them
  to `POST /api/pos/sale`.
- Reuse the mobile sync design: drop application errors (already-processed),
  retry only on network errors; warn staff when a queued sale fails to sync.

**Implementation steps**
1. Add service worker + manifest to the Vite build; precache shell + assets.
2. Cache catalogue/stock snapshots for offline lookup.
3. Offline queue module (IndexedDB) mirroring the mobile queue semantics.
4. Connectivity detector + background flush on reconnect; conflict handling for
   stock (server remains source of truth; reconcile on sync).
5. UI: offline banner, pending-sync count, and per-sale sync status/failures.

**Effort:** Large (2–3 weeks). **Dependency:** none, but requires careful
testing of stock reconciliation under concurrency.

---

## Suggested delivery phases

| Phase | Scope | Rationale |
|---|---|---|
| 1 | M-Pesa STK Push + reconciliation | Immediate cash-flow/UX value |
| 2 | KRA eTIMS (invoices + QR on receipts) | Legal/tax compliance |
| 3 | Receipt printing (Tier 1 browser) | Complete the checkout loop |
| 4 | Barcode label printing | Operational efficiency |
| 5 | Receipt printing Tier 2 (ESC/POS) | Hardware polish |
| 6 | Web offline sync (PWA) | Resilience for poor connectivity |

Each phase is independently shippable. eTIMS and M-Pesa should be built against
their **sandbox** environments first and require external credentials/approval,
so start those onboarding processes early.
