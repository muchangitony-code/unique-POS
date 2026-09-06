/*
 * Production print asset bridge.
 * Print documents are opened as about:blank. Relative and root-relative branding
 * asset URLs therefore need the live application origin as their base.
 */
(function () {
  if (window.__uniquePosPrintAssetBridgeInstalled) return;
  window.__uniquePosPrintAssetBridgeInstalled = true;

  var nativeOpen = window.open;
  window.open = function () {
    var pw = nativeOpen.apply(window, arguments);
    if (!pw) return pw;

    try {
      var doc = pw.document;
      var nativeWrite = doc.write.bind(doc);
      var injected = false;
      doc.write = function () {
        var html = Array.prototype.join.call(arguments, '');
        if (!injected) {
          var base = '<base href="' + window.location.origin.replace(/\/$/, '') + '/">';
          if (/<head\b[^>]*>/i.test(html)) {
            html = html.replace(/<head\b[^>]*>/i, function (match) {
              return match + base;
            });
          } else {
            html = base + html;
          }
          injected = true;
        }
        return nativeWrite(html);
      };
    } catch (_) {
      /* Printing must remain functional even if the browser blocks document patching. */
    }
    return pw;
  };
})();
