(function () {
  "use strict";

  var activePdfJob = false;

  function money(value) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getBasketRows() {
    return Array.from(document.querySelectorAll(".basket-table tbody tr")).map(function (row) {
      var cells = row.querySelectorAll("td");
      if (cells.length < 4) return null;
      var description = (cells[1] && cells[1].querySelector("strong") ? cells[1].querySelector("strong").textContent : "Item").trim();
      var meta = (cells[1] ? cells[1].textContent : "").trim();
      var priceMatch = meta.match(/KES\s*([\d,]+(?:\.\d+)?)/i);
      var quantity = Number((cells[2] ? cells[2].textContent : "1").replace(/[^0-9.-]/g, "")) || 1;
      var totalMatch = (cells[3] ? cells[3].textContent : "").match(/KES\s*([\d,]+(?:\.\d+)?)/i);
      var unitPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : 0;
      var total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : unitPrice * quantity;
      return { description: description, quantity: quantity, unitPrice: unitPrice, total: total };
    }).filter(Boolean);
  }

  function getSummary() {
    var rows = Array.from(document.querySelectorAll(".pos-summary-row"));
    var result = { subtotal: 0, discount: 0, vat: 0, shipping: 0, total: 0 };
    rows.forEach(function (row) {
      var label = (row.querySelector("span") ? row.querySelector("span").textContent : "").trim().toLowerCase();
      var text = (row.querySelector("strong") ? row.querySelector("strong").textContent : row.textContent).replace(/,/g, "");
      var match = text.match(/KES\s*([\d.-]+)/i);
      var value = match ? Number(match[1]) : 0;
      if (label === "subtotal") result.subtotal = value;
      else if (label === "discount") result.discount = Number((row.querySelector("input") || {}).value || value || 0);
      else if (label.indexOf("vat") === 0) result.vat = value;
      else if (label === "shipping") result.shipping = Number((row.querySelector("input") || {}).value || value || 0);
      else if (label === "grand total") result.total = value;
    });
    return result;
  }

  function buildDraftHtml(type) {
    var rows = getBasketRows();
    var totals = getSummary();
    var customerSelect = document.getElementById("posCustomerSelect");
    var customer = customerSelect && customerSelect.selectedOptions[0] ? customerSelect.selectedOptions[0].textContent.trim() : "Walk-in Customer";
    var title = type === "quotation" ? "Quotation" : "Tax Invoice";
    var number = (type === "quotation" ? "QT-DOWNLOAD-" : "INV-DOWNLOAD-") + String(Date.now()).slice(-8);
    var validity = new Date();
    validity.setDate(validity.getDate() + 30);
    var rowsHtml = rows.map(function (row) {
      return "<tr><td>—</td><td><strong>" + escapeHtml(row.description) + "</strong></td><td class=\"num\">" + row.quantity + "</td><td>pcs</td><td class=\"num\">" + money(row.unitPrice) + "</td><td class=\"num\">" + money(row.total) + "</td></tr>";
    }).join("") || "<tr><td colspan=\"6\" class=\"empty\">No line items</td></tr>";

    return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
      "@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#172033;font-size:11px;margin:0}.page{width:100%;}.top{border-top:6px solid #083d6d;padding-top:14px;display:flex;justify-content:space-between;gap:20px}.brand h1{margin:0;color:#083d6d;font-size:20px}.brand p{margin:4px 0;line-height:1.5}.title{background:#083d6d;color:#fff;padding:14px 16px;min-width:190px}.title h2{margin:0 0 8px;font-size:18px}.title div{margin:4px 0}.customer{margin-top:18px;border:1px solid #dbe2ea;padding:12px}.customer strong{font-size:13px}.items{margin-top:18px;border:1px solid #dbe2ea}.items table{width:100%;border-collapse:collapse}.items th{background:#083d6d;color:#fff;text-align:left;padding:8px}.items td{padding:8px;border-bottom:1px solid #edf1f5}.num{text-align:right;white-space:nowrap}.totals{margin:18px 0 0 auto;width:320px;border:1px solid #dbe2ea}.line{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #edf1f5}.grand{background:#083d6d;color:#fff;font-size:16px;font-weight:bold}.terms{margin-top:18px;border:1px solid #dbe2ea;padding:12px}.footer{margin-top:22px;text-align:center;color:#667085}.empty{text-align:center;padding:18px;color:#98a2b3}</style></head><body><div class=\"page\"><div class=\"top\"><div class=\"brand\"><h1>Unique Solar Kenya Ltd</h1><p>Nairobi, Kenya</p><p>Solar, electrical and energy products</p></div><div class=\"title\"><h2>" + title + "</h2><div>No: " + number + "</div><div>Date: " + new Date().toLocaleDateString() + "</div><div>" + (type === "quotation" ? "Valid Until: " + validity.toLocaleDateString() : "Due: On receipt") + "</div></div></div><div class=\"customer\"><strong>Bill To</strong><div>" + escapeHtml(customer) + "</div></div><div class=\"items\"><table><thead><tr><th>Code</th><th>Description</th><th class=\"num\">Qty</th><th>Unit</th><th class=\"num\">Unit Price</th><th class=\"num\">Amount</th></tr></thead><tbody>" + rowsHtml + "</tbody></table></div><div class=\"totals\"><div class=\"line\"><span>Subtotal</span><strong>" + money(totals.subtotal) + "</strong></div>" + (totals.discount ? "<div class=\"line\"><span>Discount</span><strong>− " + money(totals.discount) + "</strong></div>" : "") + "<div class=\"line\"><span>VAT</span><strong>" + money(totals.vat) + "</strong></div>" + (totals.shipping ? "<div class=\"line\"><span>Shipping</span><strong>" + money(totals.shipping) + "</strong></div>" : "") + "<div class=\"line grand\"><span>Grand Total</span><strong>" + money(totals.total) + "</strong></div></div><div class=\"terms\"><strong>Terms &amp; Conditions</strong><p>Quotation/invoice generated from the current POS basket. Payment is not required to download this document.</p><p>Goods remain the property of the seller until paid in full. Warranty applies where specified.</p></div><div class=\"footer\">Thank you for your business.</div></div></body></html>";
  }

  function downloadHtmlAsPdf(type) {
    if (activePdfJob) return;
    if (!window.html2pdf) {
      window.alert("PDF engine is still loading. Please try Download again in a moment.");
      return;
    }
    if (!document.querySelector(".basket-table tbody tr")) {
      window.alert("Add products before downloading the document.");
      return;
    }
    activePdfJob = true;
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;background:#fff;";
    document.body.appendChild(iframe);
    var doc = iframe.contentDocument;
    doc.open();
    doc.write(buildDraftHtml(type));
    doc.close();
    var filename = (type === "quotation" ? "quotation" : "invoice") + "-draft.pdf";
    window.setTimeout(function () {
      window.html2pdf().set({
        margin: 0,
        filename: filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).from(doc.body).save().then(function () {
        iframe.remove();
        activePdfJob = false;
      }).catch(function () {
        iframe.remove();
        activePdfJob = false;
        window.alert("Unable to generate the PDF. Please try again.");
      });
    }, 250);
  }

  function addDraftDownloadButtons() {
    if (document.body.dataset.paymentDownloadFixBound === "1") return;
    var sales = document.getElementById("viewRoot");
    if (!sales) return;
    var buttons = sales.querySelectorAll('[data-action="preview-quotation-before-sale"], [data-action="preview-invoice-before-sale"]');
    buttons.forEach(function (button) {
      if (button.dataset.downloadFixAdded === "1") return;
      var type = button.getAttribute("data-action").indexOf("quotation") >= 0 ? "quotation" : "invoice";
      var download = button.cloneNode(true);
      download.dataset.downloadFixAdded = "1";
      download.removeAttribute("data-action");
      download.dataset.downloadDraft = type;
      download.innerHTML = '<i class="fa-solid fa-file-pdf"></i>Download ' + (type === "quotation" ? "Quote" : "Invoice");
      button.insertAdjacentElement("afterend", download);
      download.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        downloadHtmlAsPdf(type);
      }, true);
    });
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest && event.target.closest('[data-action="download-receipt-now"]');
    if (target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Downloading a draft receipt must never create a sale or run payment validation.
      downloadHtmlAsPdf("invoice");
      return;
    }
  }, true);

  var observer = new MutationObserver(function () {
    addDraftDownloadButtons();
  });

  function start() {
    addDraftDownloadButtons();
    observer.observe(document.getElementById("viewRoot") || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
