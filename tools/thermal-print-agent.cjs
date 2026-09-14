"use strict";

// UniquePOS local thermal printer agent.
// Runs on the Windows POS computer and accepts print jobs only from localhost.
// It supports installed Windows RAW printers and network ESC/POS printers.

const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.UNIQUEPOS_PRINT_PORT || 17890);
const CONFIG_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, "UniquePOS")
  : path.join(os.homedir(), ".uniquepos");
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
    "Access-Control-Allow-Headers": "Content-Type"
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

function escPosInit() { return Buffer.from([0x1b, 0x40]); }
function escPosAlignCenter() { return Buffer.from([0x1b, 0x61, 0x01]); }
function escPosAlignLeft() { return Buffer.from([0x1b, 0x61, 0x00]); }
function escPosBold(on) { return Buffer.from([0x1b, 0x45, on ? 0x01 : 0x00]); }
function escPosCut() { return Buffer.from([0x1d, 0x56, 0x00]); }
function text(s) { return Buffer.from(String(s ?? "").replace(/\r/g, "") + "\n", "cp437"); }

function wrapLine(value, width) {
  const source = String(value ?? "").replace(/\t/g, " | ").replace(/\s+$/g, "");
  if (!source) return [""];
  const out = [];
  let rest = source;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < Math.floor(width * 0.55)) cut = width;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

function htmlTextToEscPos(receiptText, width = 48) {
  const lines = String(receiptText || "")
    .split(/\n+/)
    .map(line => line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim())
    .filter(Boolean);
  const chunks = [escPosInit(), escPosAlignLeft()];
  for (const line of lines) {
    for (const part of wrapLine(line, width)) chunks.push(text(part));
  }
  chunks.push(text(""), text(""), escPosCut());
  return Buffer.concat(chunks);
}

function powershell(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, ...args], { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

async function listWindowsPrinters() {
  if (process.platform !== "win32") return [];
  const script = `Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress`;
  const raw = await powershell(script);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map(p => ({ name: String(p.Name), isDefault: Boolean(p.Default), offline: Boolean(p.WorkOffline), status: Number(p.PrinterStatus || 0) }));
}

async function printWindowsRaw(printerName, data) {
  if (process.platform !== "win32") throw new Error("Windows printer output is only available on Windows.");
  const base64 = data.toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UniquePosRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern int StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h; if(!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var di = new DOCINFO { pDocName = "UniquePOS Receipt", pDataType = "RAW" };
      if(StartDocPrinter(h,1,di)==0) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try { if(StartPagePrinter(h)==0) throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error()); try { int written; if(!WritePrinter(h,bytes,bytes.Length,out written) || written != bytes.Length) throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error()); } finally { EndPagePrinter(h); } } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
[UniquePosRawPrinter]::Send($args[0], [Convert]::FromBase64String($args[1]))
`;
  await powershell(script, [printerName, base64]);
}

function printNetwork(host, port, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) || 9100 });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Printer connection timed out")); }, 7000);
    socket.on("connect", () => socket.end(data));
    socket.on("error", error => { clearTimeout(timer); reject(error); });
    socket.on("close", hadError => { clearTimeout(timer); hadError ? reject(new Error("Printer connection failed")) : resolve(); });
  });
}

async function printJob(job) {
  const config = loadConfig();
  const target = job.target || config.target || "windows-default";
  const data = job.rawBase64 ? Buffer.from(job.rawBase64, "base64") : htmlTextToEscPos(job.text || "", Number(job.columns) || 48);
  if (target === "network") {
    if (!job.host) throw new Error("Network printer IP/host is required");
    await printNetwork(job.host, job.port || 9100, data);
    saveConfig({ ...config, target: "network", host: job.host, port: Number(job.port || 9100) });
    return;
  }
  let printerName = job.printerName || config.printerName;
  if (!printerName) {
    const printers = await listWindowsPrinters();
    printerName = printers.find(p => p.isDefault)?.name || printers[0]?.name;
  }
  if (!printerName) throw new Error("No Windows printer found. Install the thermal printer driver first.");
  await printWindowsRaw(printerName, data);
  saveConfig({ ...config, target: "windows", printerName });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  try {
    if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "UniquePOS Thermal Print Agent", port: PORT });
    if (req.method === "GET" && req.url === "/printers") return json(res, 200, { ok: true, printers: await listWindowsPrinters(), config: loadConfig() });
    if (req.method === "POST" && req.url === "/print") {
      const job = await readBody(req);
      await printJob(job);
      return json(res, 200, { ok: true, message: "Receipt sent to printer." });
    }
    if (req.method === "POST" && req.url === "/config") {
      const body = await readBody(req);
      saveConfig({ ...loadConfig(), ...body });
      return json(res, 200, { ok: true, config: loadConfig() });
    }
    return json(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error("[thermal-agent]", error);
    return json(res, 500, { ok: false, error: error?.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`UniquePOS Thermal Print Agent listening on http://${HOST}:${PORT}`);
  console.log(`Config: ${CONFIG_FILE}`);
});
