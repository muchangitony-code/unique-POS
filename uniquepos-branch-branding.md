---
name: Branch-aware document branding
description: Enduring constraints for rendering the owning branch's identity on documents
---

# Branch-aware document branding (UniquePOS)

Quotations, invoices, and receipts — on-screen previews AND printed/PDF output —
must render the **owning branch's** identity, not the single company identity.

**Rules that must hold:**
- Layer branch identity over company branding per-field; a blank branch field
  falls back to the company value so nothing renders empty.
  **Why:** stated requirement. **How:** `brandingForBranch()` in `company.ts`.
- "Blank" means *trimmed*-empty. A bare `a || b` leaks whitespace-only branch
  values into documents; always trim before the fallback.
- Only identity/contact/payment/footer/logo are per-branch. Visual identity
  (colours, fonts, stamp, signature, warranty, VAT, website) stays company-level.
- Parity: every place a document is shown (list print buttons, preview dialogs,
  the POS receipt modal, the wizard preview) must go through the same resolver —
  it's easy to miss a hardcoded surface (the receipt modal footer was one).

## Gotchas
- **Print HTML is an XSS sink.** Any string interpolated into the print window —
  especially asset URLs in `<img src="...">` — must pass through `esc()`.
- **`branch_id` is returned by the server but absent from the OpenAPI schema**
  for Invoice/Quotation/Sale, so generated types omit it (pages currently cast).
  The correct fix is to add it to those response schemas and regenerate.
- Build the branch-id→details map from `useListBranches()` (full detail per
  branch). `GET /branches/options` lacks address/bank/footer fields.
