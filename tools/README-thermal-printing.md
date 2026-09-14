# UniquePOS direct thermal printing

The POS can print 80mm receipts directly to a Windows thermal printer without opening Chrome's Save as PDF dialog.

## One-time setup on the till computer

1. Install the thermal printer normally in Windows and print a Windows test page.
2. Make sure Node.js 24+ is installed on the till computer.
3. From the UniquePOS project folder, run `tools\\start-thermal-agent.bat`.
4. Leave that window running while the till is operating.
5. Open UniquePOS and complete a test sale.
6. Press **Thermal 80mm**. The receipt is sent as RAW ESC/POS to the Windows default printer.

The agent listens only on `localhost:17890`, so it is not exposed to the LAN or internet.

## Multiple printers

The agent automatically uses the Windows default printer. A future printer selector can store a specific printer name in `%APPDATA%\\UniquePOS\\thermal-printer.json`.

## Network thermal printer

The agent also supports ESC/POS network printers on TCP port 9100 by sending a `/print` job with `target: "network"`, `host`, and `port`.

## Browser fallback

A4 printing and non-thermal documents continue to use the normal browser print dialog. If the local thermal agent is not running, the POS reports that the thermal printer is not ready instead of silently saving a PDF.
