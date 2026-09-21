"use strict";

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.UNIQUEPOS_PRINT_PORT || 17890);
const AGENT_VERSION = "2.0.0-driver";
const CONFIG_DIR = process.env.APPDATA ? path.join(process.env.APPDATA, "UniquePOS") : path.join(os.homedir(), ".uniquepos");
const CONFIG_FILE = path.join(CONFIG_DIR, "thermal-printer.json");

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}
function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}
function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true"
  });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) req.destroy(new Error("Request too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function powershell(script, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    execFile("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed || error.signal === "SIGTERM" || error.code === "ETIMEDOUT") {
            reject(new Error("Windows printer operation timed out after " + Math.round(timeout / 1000) + " seconds."));
          } else {
            reject(new Error((stderr || stdout || error.message).trim()));
          }
          return;
        }
        resolve(String(stdout || "").trim());
      }
    );
  });
}

async function listWindowsPrinters() {
  if (process.platform !== "win32") return [];
  // Do not enumerate the Windows printer collection here. On some systems a
  // broken/slow printer provider can block the entire collection query even
  // though the target printer is installed and usable.
  const config = loadConfig();
  const name = String(config.printerName || "Xprinter XP-D2").trim();
  return name ? [{
    name,
    isDefault: false,
    offline: false,
    status: 3,
    driver: "Xprinter XP-D2",
    port: "USB001"
  }] : [];
}

async function diagnostics(printerName) {
  if (process.platform !== "win32") return { platform: process.platform };
  const safe = String(printerName || "").replace(/'/g, "''");
  const raw = await powershell(`
$ErrorActionPreference = 'Stop'
$svc = Get-Service -Name Spooler
$p = Get-Printer -Name '${safe}' -ErrorAction SilentlyContinue
$jobs = @()
if ($p) { $jobs = @(Get-PrintJob -PrinterName '${safe}' -ErrorAction SilentlyContinue | Select-Object Id,JobStatus,Submitted,DocumentName) }
$driver = $null
$port = $null
if ($p) {
  $driver = Get-PrinterDriver -Name $p.DriverName -ErrorAction SilentlyContinue | Select-Object Name,MajorVersion,DriverVersion,InfPath
  $port = Get-PrinterPort -Name $p.PortName -ErrorAction SilentlyContinue | Select-Object Name,PrinterHostAddress,PortNumber
}
[pscustomobject]@{
  spooler=$svc.Status.ToString()
  printer=if($p){[pscustomobject]@{Name=$p.Name;Default=$p.Default;PrinterStatus=$p.PrinterStatus;WorkOffline=$p.WorkOffline;DriverName=$p.DriverName;PortName=$p.PortName}}else{$null}
  driver=$driver
  port=$port
  jobs=$jobs
} | ConvertTo-Json -Depth 6 -Compress
`, 10000);
  return raw ? JSON.parse(raw) : {};
}

async function printWindowsDriver(printerName, receiptText) {
  if (process.platform !== "win32") throw new Error("Windows printer output is only available on Windows.");
  const printer64 = Buffer.from(String(printerName || ""), "utf8").toString("base64");
  const receipt64 = Buffer.from(String(receiptText || ""), "utf8").toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
$printerName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${printer64}'))
$receipt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${receipt64}'))
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Printing;
public static class UniquePosDriverPrint {
  public static void Print(string printer, string receipt) {
    using (var doc = new PrintDocument()) {
      doc.DocumentName = "UniquePOS Receipt";
      doc.PrinterSettings.PrinterName = printer;
      if (!doc.PrinterSettings.IsValid) throw new Exception("Windows printer is not valid: " + printer);
      doc.PrintController = new StandardPrintController();
      var lines = receipt.Replace("\\r", "").Split(new[] {'\\n'}, StringSplitOptions.None);
      var paperHeight = Math.Max(500, Math.Min(4000, lines.Length * 22 + 100));
      doc.DefaultPageSettings.Margins = new Margins(0,0,0,0);
      doc.DefaultPageSettings.PaperSize = new PaperSize("UniquePOS80mm", 315, paperHeight);
      doc.PrintPage += delegate(object sender, PrintPageEventArgs e) {
        using (var normal = new Font("Arial", 9.0f))
        using (var bold = new Font("Arial", 9.0f, FontStyle.Bold)) {
          float y = 5;
          float width = e.PageBounds.Width - 10;
          foreach (var original in lines) {
            string line = original ?? "";
            Font font = (line.StartsWith("TOTAL") || line.StartsWith("Receipt:")) ? bold : normal;
            while (line.Length > 0) {
              string part = line.Length > 56 ? line.Substring(0,56) : line;
              e.Graphics.DrawString(part, font, Brushes.Black, new RectangleF(5,y,width,20));
              y += 19;
              line = line.Length > part.Length ? line.Substring(part.Length) : "";
            }
            if (original.Length == 0) y += 3;
          }
          e.HasMorePages = false;
        }
      };
      doc.Print();
    }
  }
}
'@
[UniquePosDriverPrint]::Print($printerName, $receipt)
`;
  await powershell(script, 25000);
}

async function printJob(job) {
  const config = loadConfig();
  const printerName = String(job.printerName || config.printerName || "Xprinter XP-D2").trim();
  if (!printerName) throw new Error("No thermal printer configured.");
  await printWindowsDriver(printerName, job.text || "");
  saveConfig({ ...config, target: "windows", printerName });
  return printerName;
}

const server = http.createServer(async (req,res) => {
  if (req.method === "OPTIONS") return json(res,204,{});
  try {
    // Use only the URL pathname so browser tracking/query parameters cannot break routing.
    const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
    if (req.method === "GET" && pathname === "/health")
      return json(res,200,{ok:true,service:"UniquePOS Thermal Print Agent",version:AGENT_VERSION,port:PORT});
    if (req.method === "GET" && pathname === "/printers")
      return json(res,200,{ok:true,printers:await listWindowsPrinters(),config:loadConfig()});
    if (req.method === "GET" && pathname === "/diagnostics") {
      const config=loadConfig();
      const printers=await listWindowsPrinters();
      const printerName=config.printerName || printers.find(p=>p.isDefault)?.name || printers[0]?.name || "";
      return json(res,200,{ok:true,printer:printerName,diagnostics:await diagnostics(printerName)});
    }
    if (req.method === "POST" && pathname === "/print") {
      const job=await readBody(req);
      const printerName=await printJob(job);
      return json(res,200,{ok:true,printerName,message:"Receipt sent through the Windows printer driver."});
    }
    if (req.method === "POST" && pathname === "/config") {
      const body=await readBody(req);
      saveConfig({...loadConfig(),...body});
      return json(res,200,{ok:true,config:loadConfig()});
    }
    return json(res,404,{ok:false,error:"Not found"});
  } catch(error) {
    console.error("[thermal-agent]",error);
    return json(res,500,{ok:false,error:error?.message||String(error)});
  }
});

server.listen(PORT,HOST,()=> {
  console.log("UniquePOS Thermal Print Agent listening on http://"+HOST+":"+PORT);
  console.log("Config: "+CONFIG_FILE);
});
