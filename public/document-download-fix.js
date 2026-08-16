(function () {
  "use strict";

  var busy = false;

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(num(value));
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function basket() {
    return Array.from(document.querySelectorAll(".basket-table tbody tr")).map(function (row) {
      var cells = row.querySelectorAll("td");
      if (cells.length < 4) return null;
      var description = cells[1] && cells[1].querySelector("strong") ? cells[1].querySelector("strong").textContent.trim() : "Item";
      var text = cells[1] ? cells[1].textContent : "";
      var price = (text.match(/KES\s*([\d,]+(?:\.\d+)?)/i) || ["", "0"])[1];
      var total = ((cells[3] ? cells[3].textContent : "").match(/KES\s*([\d,]+(?:\.\d+)?)/i) || ["", "0"])[1];
      var quantity = num((cells[2] ? cells[2].textContent : "1").replace(/[^0-9.-]/g, "")) || 1;
      return { description: description, quantity: quantity, unitPrice: num(price.replace(/,/g, "")), total: num(total.replace(/,/g, "")) };
    }).filter(Boolean);
  }

  function totals() {
    var result = { subtotal: 0, discount: 0, vat: 0, shipping: 0, total: 0 };
    document.querySelectorAll(".pos-summary-row").forEach(function (row) {
      var label = ((row.querySelector("span") || {}).textContent || "").trim().toLowerCase();
      var input = row.querySelector("input");
      var text = ((row.querySelector("strong") || row).textContent || "").replace(/,/g, "");
      var value = num(((text.match(/KES\s*([\d.-]+)/i) || ["", "0"])[1]));
      if (label === "subtotal") result.subtotal = value;
      if (label === "discount") result.discount = input ? num(input.value) : value;
      if (label.indexOf("vat") === 0) result.vat = value;
      if (label === "shipping") result.shipping = input ? num(input.value) : value;
      if (label === "grand total") result.total = value;
    });
    return result;
  }

  function documentHtml(type) {
    var rows = basket();
    var t = totals();
    var customer = document.getElementById("posCustomerSelect");
    var customerName = customer && customer.selectedOptions[0] ? customer.selectedOptions[0].textContent.trim() : "Walk-in Customer";
    var quotation = type === "quotation";
    var title = quotation ? "Quotation" : "Tax Invoice";
    var number = (quotation ? "QT-DRAFT-" : "INV-DRAFT-") + String(Date.now()).slice(-8);
    var valid = new Date(); valid.setDate(valid.getDate() + 30);
    var items = rows.map(function (r) {
      return "<tr><td>—</td><td><strong>" + esc(r.description) + "</strong></td><td class='num'>" + r.quantity + "</td><td>pcs</td><td class='num'>" + money(r.unitPrice) + "</td><td class='num'>" + money(r.total) + "</td></tr>";
    }).join("");
    return "<div class='pdf-page'><style>.pdf-page{width:190mm;box-sizing:border-box;font-family:Arial,sans-serif;color:#172033;font-size:11px;background:#fff;padding:0}.pdf-top{border-top:6px solid #083d6d;padding-top:14px;display:flex;justify-content:space-between;gap:20px}.pdf-brand h1{margin:0;color:#083d6d;font-size:20px}.pdf-brand p{margin:4px 0}.pdf-title{background:#083d6d;color:#fff;padding:14px 16px;min-width:190px}.pdf-title h2{margin:0 0 8px;font-size:18px}.pdf-customer,.pdf-items,.pdf-terms{margin-top:18px;border:1px solid #dbe2ea;padding:12px}.pdf-items{padding:0}.pdf-items table{width:100%;border-collapse:collapse}.pdf-items th{background:#083d6d;color:#fff;text-align:left;padding:8px}.pdf-items td{padding:8px;border-bottom:1px solid #edf1f5}.num{text-align:right;white-space:nowrap}.pdf-totals{margin:18px 0 0 auto;width:320px;border:1px solid #dbe2ea}.pdf-line{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #edf1f5}.pdf-grand{background:#083d6d;color:#fff;font-size:16px;font-weight:bold}.pdf-footer{margin-top:22px;text-align:center;color:#667085}</style><div class='pdf-top'><div class='pdf-brand'><h1>Unique Solar Kenya Ltd</h1><p>Nairobi, Kenya</p><p>Solar, electrical and energy products</p></div><div class='pdf-title'><h2>" + title + "</h2><div>No: " + number + "</div><div>Date: " + new Date().toLocaleDateString("en-KE") + "</div><div>" + (quotation ? "Valid Until: " + valid.toLocaleDateString("en-KE") : "Due: On receipt") + "</div></div></div><div class='pdf-customer'><strong>Bill To</strong><div>" + esc(customerName) + "</div></div><div class='pdf-items'><table><thead><tr><th>Code</th><th>Description</th><th class='num'>Qty</th><th>Unit</th><th class='num'>Unit Price</th><th class='num'>Amount</th></tr></thead><tbody>" + (items || "<tr><td colspan='6'>No items</td></tr>") + "</tbody></table></div><div class='pdf-totals'><div class='pdf-line'><span>Subtotal</span><strong>" + money(t.subtotal) + "</strong></div>" + (t.discount ? "<div class='pdf-line'><span>Discount</span><strong>− " + money(t.discount) + "</strong></div>" : "") + "<div class='pdf-line'><span>VAT</span><strong>" + money(t.vat) + "</strong></div>" + (t.shipping ? "<div class='pdf-line'><span>Shipping</span><strong>" + money(t.shipping) + "</strong></div>" : "") + "<div class='pdf-line pdf-grand'><span>Grand Total</span><strong>" + money(t.total) + "</strong></div></div><div class='pdf-terms'><strong>Terms &amp; Conditions</strong><p>This document was generated from the current POS basket. Payment is not required to download it.</p><p>Goods remain the property of the seller until paid in full. Warranty applies where specified.</p></div><div class='pdf-footer'>Thank you for your business.</div></div>";
  }

  function save(type) {
    if (busy) return;
    if (typeof window.html2pdf !== "function") {
      window.alert("PDF generator is not loaded. Refresh the POS page and try again.");
      return;
    }
    if (!basket().length) {
      window.alert("Add products before downloading the document.");
      return;
    }

    busy = true;
    var holder = document.createElement("div");
    holder.setAttribute("aria-hidden", "true");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:190mm;background:#fff;z-index:-1;";
    holder.innerHTML = documentHtml(type);
    document.body.appendChild(holder);

    var target = holder.firstElementChild;
    var options = {
      margin: [0, 0, 0, 0],
      filename: (type === "quotation" ? "quotation" : "invoice") + "-draft.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };

    Promise.resolve(window.html2pdf().set(options).from(target).save())
      .then(function () {
        holder.remove();
        busy = false;
      })
      .catch(function (error) {
        console.error("Document PDF generation failed:", error);
        holder.remove();
        busy = false;
        window.alert("Unable to generate document PDF. Please try again.");
      });
  }

  function installButtons() {
    var root = document.getElementById("viewRoot");
    if (!root) return;
    root.querySelectorAll('[data-action="preview-quotation-before-sale"], [data-action="preview-invoice-before-sale"]').forEach(function (button) {
      if (button.dataset.documentDownloadFix === "1") return;
      var type = button.getAttribute("data-action").indexOf("quotation") >= 0 ? "quotation" : "invoice";
      button.dataset.documentDownloadFix = "1";
      button.dataset.documentDownloadType = type;
      button.removeAttribute("data-action");
      button.innerHTML = '<i class="fa-solid fa-file-pdf"></i>Download ' + (type === "quotation" ? "Quote" : "Invoice");
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        save(type);
      }, true);
    });
  }

  function start() {
    installButtons();
    var root = document.getElementById("viewRoot") || document.body;
    new MutationObserver(installButtons).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
