# Invoice and quotation PDF root cause

The previous PDF path used a runtime font path and registered only one regular DejaVu face. That was unsafe once the application was bundled/deployed because the referenced TTF path was not guaranteed to exist. The renderer could therefore fall back to built-in PDF fonts with incomplete glyph coverage, producing unreadable output or missing-glyph boxes.

The invariant is now: **PDF text may only use the build-time embedded DejaVu Sans regular and bold buffers.** The build step resolves the TTFs, embeds compressed font bytes into `server/pdf/fonts.generated.cjs`, and the runtime loader converts those embedded bytes into Buffers. The renderer registers `body` and `bodyBold` before any text call and throws if the embedded buffers are absent or empty. There is no runtime filesystem font lookup and no built-in-font fallback.
