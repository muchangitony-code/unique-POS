(() => {
  const AGENT = 'http://localhost:17890';
  const directPrint = async (child) => {
    const html = child?.document?.documentElement?.outerHTML || '';
    if (!/80mm/i.test(html) || !/Receipt/i.test(child?.document?.title || '')) return false;
    const text = child.document.body?.innerText || '';
    if (!text.trim()) throw new Error('Receipt preview is empty.');
    const response = await fetch(`${AGENT}/print`, {
      method: 'POST',
      mode: 'cors',
      targetAddressSpace: 'loopback',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, columns: 48 })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || 'Thermal print failed.');
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
          alert(`Thermal printer is not ready.\n\n${error?.message || error}\n\nStart the UniquePOS Thermal Print Agent on this POS computer.`);
          return;
        }
        originalPrint();
      };
    } catch {}
    return child;
  };
})();
