# Quotation Subsystem Fixes

## Issues Found and Resolved

### 1. **Branding Name Typo** ✅ FIXED
- **Issue**: Legal name was "Uniques Solar & General Supplies Limited" (extra 's' in "Uniques")
- **Fix**: Changed to "Unique Solar & General Supplies Limited"
- **Location**: `server/document-branding.cjs` line 4
- **Impact**: All newly generated quotations, invoices, and receipts will now display the correct company name

### 2. **Website URL** ✅ FIXED
- **Issue**: Website URL was "https://uniquesolarltd.co.ke" (incorrect domain)
- **Fix**: Changed to "https://uniquesolarkenya.co.ke" 
- **Location**: `server/document-branding.cjs` line 6
- **Impact**: QR codes and footer links in documents now point to the correct domain

## Remaining Issues in Quotation QTN-2026-000012

The PDF shows typos that are **user-entered content** in the quotation notes field:

1. **"Thank you for shoping..."** → Should be "shopping"
2. **"Geeneral Supplies"** → Should be "General"

### Why These Remain

These typos are stored as **quotation-specific notes**, not system-generated content. They were entered when creating quotation QTN-2026-000012. To fix:

**Option A: Update the existing quotation notes**
1. Navigate to Quotations → QTN-2026-000012
2. Click "Edit Quotation"
3. Fix the typos in the "Notes" field
4. Save changes

**Option B: Regenerate the quotation with corrected text**
1. Delete quotation QTN-2026-000012
2. Create a new quotation with correct notes

## System-Generated Text (Correct)

The following default messages are correct and consistent:

- **Invoice footer**: "Goods once sold are exchangeable within 7 days with receipt. Prices include VAT where applicable. Thank you for shopping with us."
- **Quotation footer**: "This quotation is valid for 14 days from the issue date. Prices are subject to stock availability at time of order confirmation."
- **Default POS quotation notes**: "Quotation created from POS workspace."

## Testing

Verify the fixes work by:
1. Creating a new quotation through the POS
2. Generating a PDF of the quotation
3. Confirm the company name and website display correctly in the header and footer

## Files Modified

- `server/document-branding.cjs` - Updated branding constants

## Commit Hash

- 4ddd25d - Fix quotation branding: correct legal name and website URL
