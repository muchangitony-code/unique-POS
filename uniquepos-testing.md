---
name: UniquePOS testing setup
description: How tests are run across the api-server and mobile-pos artifacts.
---

# UniquePOS testing setup

## api-server
- Vitest, `environment: node`, `include: src/**/*.test.ts`, run via `pnpm --filter @workspace/api-server test`.
- Route handlers are tested by mocking `express` `Router` with a hoisted handler-capture mock, then invoking the captured handler with fake req/res. DB/audit/branch/stock/permissions modules are all `vi.mock`ed — no real database.
- **Why:** routes register on a shared Router at import time; capturing handlers lets each test call one endpoint directly without booting Express or a DB.

## mobile-pos (Expo)
- Vitest with `environment: happy-dom` and `esbuild.jsx: 'automatic'`; `include: context/**/*.test.{ts,tsx}`; run via `pnpm --filter @workspace/mobile-pos test`.
- Context providers (Cart, Auth) are plain React (not RN-native), so `@testing-library/react` `renderHook` works. Mock `@react-native-async-storage/async-storage` (default export) and `@workspace/api-client-react` (`login`).
- **How to apply:** only test pure-React context/logic this way. Full RN screens (e.g. cart.tsx) need the react-native preset and expo-module mocks — avoid; test the underlying context + server endpoint instead.

## Service-level e2e (mobile)
- To prove a whole flow works across boundaries without rendering RN screens, drive the *real* api-client + real contexts and mock ONLY the transport: `vi.stubGlobal("fetch", ...)` + `setBaseUrl(...)`. The api-client's `customFetch` calls global `fetch`, so a fetch mock routing by URL/method exercises real request-building and response-parsing.
- Extract screen logic that a flow test needs (e.g. cart→sale payload mapping) into a pure helper module so it's shared by the screen and the test rather than duplicated.
- The api-client's `ApiError` class is NOT re-exported from `@workspace/api-client-react`; assert HTTP failures structurally (`"status" in err`), not via `instanceof`.
