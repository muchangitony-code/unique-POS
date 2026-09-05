---
name: UniquePOS offline sales sync
description: How the mobile POS queues sales offline and syncs them when connectivity returns
---

# Offline sales queue (mobile-pos)

Field staff can complete sales with no network. Sales are queued in AsyncStorage and flushed automatically when connectivity returns.

- **Where:** `context/OfflineSalesContext.tsx` provides `isOnline`, `pendingCount`, `isSyncing`, `enqueueSale`, `syncNow`. Provider is mounted in `app/_layout.tsx` (above CartProvider) with an `onSynced` Alert for the "synced successfully" confirmation.
- **Connectivity:** uses `@react-native-community/netinfo` (`addEventListener` + `fetch`). Online = `isConnected !== false && isInternetReachable !== false`.
- **Queue key:** AsyncStorage `offline_sales_queue`, array of `{ localId, saleInput, queuedAt }`. `saleInput` is the exact SaleInput body posted to POST /api/pos/sale.
- **Sync ordering rule:** on a network error mid-flush, keep that entry AND everything after it, then stop the pass — preserves sale order. On an ApiError (server rejection, e.g. insufficient stock) drop the entry so it can't block the queue forever.

**Why:** distinguishing network failure from server rejection is by whether the thrown error has a `.response instanceof Response` (ApiError shape from customFetch). A raw fetch TypeError = lost connectivity → keep & retry.

**How to apply:** checkout in `cart.tsx` calls `createSale` when online; on network error (non-ApiError) or when `!isOnline`, it falls back to `enqueueSale` and shows a "Sale Queued / Pending sync" receipt. Offline receipts have no server receipt number.
