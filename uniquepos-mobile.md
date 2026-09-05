---
name: UniquePOS Mobile App
description: Expo mobile companion for UniquePOS — auth, barcode scanner, POS cart, sales history
---

## Key decisions

**Auth:** `context/AuthContext.tsx` calls `login()` from `@workspace/api-client-react` directly (not the hook) to capture the token. Token stored in AsyncStorage under key `auth_token`. `setAuthTokenGetter(() => AsyncStorage.getItem('auth_token'))` set at module level in `app/_layout.tsx` so all API calls include the token.

**Why:** hooks can't be called outside components; the direct `login()` function works in context providers.

**Base URL:** `setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`)` at module level in `_layout.tsx`. The dev script injects `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN`.

**Auth guard pattern:** Uses `useRootNavigationState()` to detect when navigation is ready before redirecting. Without the `navState?.key` check, redirects fire before the navigator mounts and cause crashes.

**Camera:** Dynamic import of `expo-camera` via `import('expo-camera')` in NativeCameraScanner component to avoid web crashes. Web falls back to manual barcode text entry.

**expo-camera version:** Should be `~17.0.10` for Expo SDK 54 (not 16.x).

**pos.ts ANY() bug:** The original `sql\`..id = ANY(${productIds})\`` passed the array as a single parameter. Fixed with `inArray(productsTable.id, productIds)` from drizzle-orm. This was needed for checkout to work.

**Colors:** Synced from web app CSS — primary `#1e4d8b` (deep blue), accent `#f4a012` (solar gold), navBackground `#0e2347` (deep navy sidebar). Dark mode uses `#3b78f5` as primary.

**Tabs:** 3 tabs — Scanner (barcode icon), Cart (cart with badge), Sales (receipt). NativeTabs for iOS 26+ with SF symbols; ClassicTabs fallback with Ionicons.
