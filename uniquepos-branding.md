---
name: UniquePOS Branding System
description: Brand colours, company constants, and print-document architecture for Unique Solar Kenya Ltd
---

## Brand palette (CSS variables in index.css)
- Primary (deep blue): `hsl(215, 65%, 33%)` — sidebar nav active uses solar gold instead
- Sidebar background: `hsl(216, 68%, 14%)` — deep navy matching logo panels
- Sidebar-primary (active nav): `hsl(37, 91%, 52%)` — solar gold
- Accent: `hsl(37, 91%, 52%)` — solar gold
- Chart-3: same solar gold

## Company constants
All company details live in `artifacts/unique-pos/src/lib/company.ts` (COMPANY object).
`COMPANY.logoUrl()` returns the absolute URL to `/logo.jpg` (in `public/`) — required for print windows.

## Print document system
`artifacts/unique-pos/src/lib/printDoc.ts` exports `printInvoice`, `printQuotation`, `printReceipt`.
- All user-supplied fields (names, notes, product names, **and all payment values**) are escaped via `esc()` before HTML interpolation — **never remove this**.

## Payment details are DB-backed, NOT from COMPANY constants
Payment info (M-Pesa paybill/account/till/buy-goods, bank name/branch/account name/number/SWIFT, other methods) lives in the `business_settings` table, editable only via `PATCH /settings/payment` (super_admin/business_owner only; see uniquepos-auth). Documents render it by passing `toPaymentDetails(settings)` into the print functions — `printInvoice/Quotation/Receipt` accept an optional `payment: PaymentDetails`. Pages fetch it with `useGetSettings()`.
**Why:** requirement = no hard-coded payment info in templates; documents must always pull the latest. `COMPANY.mpesa` in company.ts is now legacy — do not reintroduce hard-coded payment lines in printDoc.
**Access nuance:** `GET /settings` is readable by ALL authenticated users (removed the blanket `requireRole("administrator")` on `/settings` in routes/index.ts) so cashiers printing receipts get payment details; write routes are guarded per-route in settings.ts.
- Documents open in a new `window.open` popup and auto-trigger `window.print()`.
- All styles are inline/self-contained (no Tailwind dependency in print windows).

## Reports print approach
`artifacts/unique-pos/src/pages/reports.tsx` uses `useEffect` to inject print CSS into `<head>` (avoids JSX template-literal parse issues with CSS `{}`). Print button calls `window.print()` directly. Print-only company header uses class `reports-print-only`; screen-only elements use `reports-print-hide`.

**Why:** A `<style>` JSX element with a template literal containing CSS `{}` caused "Unterminated JSX contents" parse errors in Vite/Babel — `useEffect` injection is the safe pattern.

## Logo / company constants are FALLBACK ONLY
The bundled `public/logo.jpg` and the `COMPANY.*` constants are fallback defaults. In app code prefer `useBranding().branding.logoUrl`; plain print functions call `getBranding().logoUrl`. Admin-uploaded branding always wins.

## Dynamic branding module (Company Branding & Document Settings)
Admin-editable branding lives in `business_settings` (logos, colours, tagline, website, VAT, document footer, warranty/return policy, quotation validity days, invoice payment terms). Every branded surface (login, sidebar, quotations, invoices, receipts, audit PDF, emails) must pull these dynamically — no hard-coded company values. Colours flow through a hex→HSL runtime theme applied to `:root`.

### Sensitive-config authz: use requireSuperAdmin (DB-role allowlist), NOT requireRole tier
Branding writes **and** payment writes go through dedicated routes guarded by `requireSuperAdmin` (`SUPER_ADMIN_ROLES` = super_admin + business_owner) — a DB-role allowlist, not the functional-tier `requireRole("administrator")`.
**Why:** the two happen to resolve to the same roles today, but the tier map (ROLE_TIER_MAP) can be remapped (e.g. branch_manager → administrator) and would silently widen access to sensitive config. Keep branding/payment on the explicit allowlist so they tighten independently. General business settings (name/address/currency/SMTP/security alerts) stay on `requireRole("administrator")`.
**How to apply:** any new sensitive-config surface (theme, logos, payment, secrets) → split into its own route with `requireSuperAdmin`; never fold it into the shared `PATCH /settings` (administrator-tier) body.

### Public branding endpoint & storage lockdown
- `GET /settings/branding` (in PUBLIC_PATHS) exposes only a non-sensitive subset so login/print render pre-auth; payment/SMTP never appear there.
- **Storage read route is locked to the `uploads/` prefix.** `GET /storage/objects/uploads/*` is the only publicly readable path. **Why:** DB backups (backup.ts) share the same object-storage bucket; an unrestricted public read route would expose them. Never widen this prefix.

### BrandingProvider cache sync
See branding-cache-sync.md — the provider feeds the module-level cache in company.ts *synchronously during render* so plain print/PDF utilities and the React tree stay in lockstep.

### Email branding
`lib/email.ts` templates take optional `companyName` (default "UniquePOS"); every caller must pass `settings.businessName` or emails silently fall back to the generic brand.
