(() => {
  const AGENT = 'http://localhost:17890';
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, mode: 'cors', targetAddressSpace: 'loopback' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || `Thermal agent returned ${response.status}`);
    return result;
  };
  const choosePrinter = async () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('uniquepos.thermalPrinter') || 'null'); } catch {}
    const result = await request(`${AGENT}/printers`);
    const printers = Array.isArray(result.printers) ? result.printers : [];
    // Validate cached printer names against the current Windows printer list.
    try { saved = JSON.parse(localStorage.getItem("uniquepos.thermalPrinter") || "null"); } catch {}
    if (saved?.printerName && printers.some(p => p.name === saved.printerName)) return saved.printerName;
    const physical = printers.filter(p => !/pdf|xps|onenote|fax/i.test(p.name));
    const thermal = physical.find(p => /thermal|receipt|pos|rongta|xprinter|epson|zywell|zjiang|sunmi|bixolon|star|tvs|80mm/i.test(p.name));
    const selected = thermal?.name || physical.find(p => p.isDefault)?.name || physical[0]?.name;
    if (!selected) throw new Error("No physical thermal printer was found. Install the printer in Windows first.");
    localStorage.setItem("uniquepos.thermalPrinter", JSON.stringify({ printerName: selected }));
    return selected;;
  };
  const directPrint = async (child) => {
    const html = child?.document?.documentElement?.outerHTML || '';
    if (!/80mm/i.test(html) || !/Receipt/i.test(child?.document?.title || '')) return false;
    const text = child.document.body?.innerText || '';
    if (!text.trim()) throw new Error('Receipt preview is empty.');
    const printerName = await choosePrinter();
    await request(`${AGENT}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, columns: 48, printerName })
    });
    try { child.close(); } catch {}
    return true;
  };
  const nativeOpen = window.open.bind(window);
  window.open = function (...args) {
    const child = nativeOpen(...args);
    if (!child) return child;
    try {
      const originalPrint = child.print.bind(child);
      child.print = async function () {
        try {
          if (await directPrint(child)) return;
        } catch (error) {
          alert(`Thermal printer is not ready.\n\n${error?.message || error}\n\nStart the UniquePOS Thermal Print Agent on this POS computer and make sure the thermal printer is installed in Windows.`);
          return;
        }
        originalPrint();
      };
    } catch {}
    return child;
  };
})();
