'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'public', 'app.js');
let source = fs.readFileSync(file, 'utf8');

function findFunctionEnd(text, start) {
  const open = text.indexOf('{', start);
  if (open < 0) throw new Error('Counter patch: opening brace not found');
  let depth = 0, quote = null, template = false, lineComment = false, blockComment = false, escaped = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (ch === '\\') { escaped = true; continue; } if (ch === quote) quote = null; continue; }
    if (template) { if (escaped) { escaped = false; continue; } if (ch === '\\') { escaped = true; continue; } if (ch === '`') template = false; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '`') { template = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i + 1; }
  }
  throw new Error('Counter patch: unterminated function');
}

function replaceFunction(name, replacement) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Counter patch: missing ' + name);
  const end = findFunctionEnd(source, start);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceFunction('filterPosProducts', `function filterPosProducts() {
    let products = state.pos.products.slice();
    const query = firstText(state.pos.search, "").toLowerCase();
    if (query) {
      products = products.filter(function (item) {
        return [item.product_name, item.product_code, item.barcode, item.category_name, item.category].some(function (value) {
          return contains(String(value || "").toLowerCase(), query);
        });
      });
    }
    const filter = state.pos.categoryFilter;
    if (filter && filter !== "All Products") {
      products = products.filter(function (item) {
        const category = firstText(item.category_name, item.category, "Others");
        if (filter === "Others") return SALE_CATEGORIES.indexOf(category) === -1;
        return category.toLowerCase() === filter.toLowerCase();
      });
    }
    return products;
  }`);

replaceFunction('renderProductGrid', `function renderProductGrid(products) {
    if (!products.length) return renderEmptyInline("No products match the current search or category.");
    return '<div class="product-grid">' + products.map(function (product) {
      const image = resolveInventoryAssetUrl(product.image_url);
      const rawStock = product.current_stock != null ? product.current_stock : (product.stock != null ? product.stock : product.available_stock);
      const stockKnown = rawStock != null && rawStock !== "";
      const stock = stockKnown ? firstNumber(rawStock, 0) : null;
      const inStock = !stockKnown || stock > 0;
      const action = inStock ? ' data-action="add-to-basket"' : '';
      const disabled = inStock ? '' : ' disabled aria-disabled="true" title="Out of stock"';
      const buttonAction = inStock ? 'add-to-basket' : 'noop';
      const buttonText = inStock ? 'Add to Basket' : 'Out of Stock';
      return '<article class="product-card"' + action + ' data-id="' + escapeAttr(String(product.id)) + '"><div class="product-card__image">' + (image ? '<img src="' + escapeAttr(image) + '" alt="' + escapeAttr(firstText(product.product_name, 'Product')) + '" />' : '<i class="fa-solid fa-solar-panel"></i>') + '</div><div class="product-card__body"><div class="product-card__title">' + escapeHtml(firstText(product.product_name, 'Product')) + '</div><div class="product-card__meta"><span>' + money(firstNumber(product.selling_price, 0)) + '</span>' + renderStockPill(product) + '</div><button type="button" class="btn ' + (inStock ? 'btn-primary' : 'btn-outline') + '" data-action="' + buttonAction + '" data-id="' + escapeAttr(String(product.id)) + '"' + disabled + '><i class="fa-solid ' + (inStock ? 'fa-plus' : 'fa-ban') + '"></i>' + buttonText + '</button></div></article>';
    }).join("") + '</div>';
  }`);

replaceFunction('addProductToBasket', `function addProductToBasket(productId) {
    const product = state.pos.products.find(function (item) { return String(item.id) === String(productId); });
    if (!product) { showToast("Product is not available in the Counter catalogue.", "error"); return; }
    const rawStock = product.current_stock != null ? product.current_stock : (product.stock != null ? product.stock : product.available_stock);
    const stockKnown = rawStock != null && rawStock !== "";
    const stock = stockKnown ? firstNumber(rawStock, 0) : null;
    const existing = state.pos.basket.find(function (line) { return String(line.product_id) === String(productId); });
    if (stockKnown && stock <= 0) { showToast("This product is out of stock in the selected branch.", "error"); return; }
    if (existing) {
      if (stockKnown && existing.quantity >= stock) { showToast("Cannot sell more than available stock.", "error"); return; }
      existing.quantity += 1;
    } else {
      state.pos.basket.push({
        product_id: product.id,
        product_code: firstText(product.product_code, product.barcode, ""),
        product_name: firstText(product.product_name, "Product"),
        unit_price: firstNumber(product.selling_price, 0),
        quantity: 1,
        vat_rate: firstNumber(product.vat_rate, 16),
        image_url: product.image_url || ""
      });
    }
    renderCurrentRoute();
    showToast("Added to basket.", "success");
  }`);

function patchActionDispatch() {
  const marker = 'async function handleAction(action, button, event) {';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Counter patch: missing handleAction');
  const insertAt = start + marker.length;
  const guard = `\n    if (action === "add-to-basket") { addProductToBasket(button && button.dataset ? button.dataset.id : ""); return; }\n    if (action === "counter-basket-inc") { adjustCounterBasketLine(button.dataset.id, 1); return; }\n    if (action === "counter-basket-dec") { adjustCounterBasketLine(button.dataset.id, -1); return; }\n    if (action === "counter-basket-remove") { removeCounterBasketLine(button.dataset.id); return; }\n    if (action === "counter-basket-clear") { clearBasket(true); return; }\n`;
  source = source.slice(0, insertAt) + guard + source.slice(insertAt);
}

function installBasketRenderer() {
  const marker = 'function renderCurrentRoute(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Counter patch: missing renderCurrentRoute');
  source = source.replace(marker, 'function __counterOriginalRenderCurrentRoute(');
  const wrapper = `\n\n  function renderCurrentRoute() {\n    const result = __counterOriginalRenderCurrentRoute.apply(this, arguments);\n    renderCounterBasket();\n    return result;\n  }\n\n  function renderCounterBasket() {\n    if (state.activeRoute !== "sales") return;\n    const card = document.querySelector(".pos-column--basket > .section-card:first-child");\n    if (!card) return;\n    const basket = Array.isArray(state.pos.basket) ? state.pos.basket : [];\n    const subtotal = basket.reduce(function (sum, line) { return sum + firstNumber(line.unit_price, 0) * firstNumber(line.quantity, 0); }, 0);\n    const discount = firstNumber(state.pos.discount_amount, 0);\n    const shipping = firstNumber(state.pos.shipping_amount, 0);\n    const taxable = Math.max(0, subtotal - discount);\n    const vat = taxable * 0.16;\n    const total = taxable + vat + shipping;\n    const rows = basket.length ? basket.map(function (line) {\n      const id = escapeAttr(String(line.product_id));\n      const qty = firstNumber(line.quantity, 0);\n      const unit = firstNumber(line.unit_price, 0);\n      return '<tr><td><strong>' + escapeHtml(firstText(line.product_name, "Product")) + '</strong><small>' + escapeHtml(firstText(line.product_code, "")) + '</small></td><td>' + money(unit) + '</td><td><span class="qty-control"><button type="button" data-action="counter-basket-dec" data-id="' + id + '">−</button><strong>' + qty + '</strong><button type="button" data-action="counter-basket-inc" data-id="' + id + '">+</button></span></td><td>' + money(unit * qty) + '</td><td><button type="button" class="btn btn-ghost" data-action="counter-basket-remove" data-id="' + id + '" title="Remove"><i class="fa-solid fa-trash"></i></button></td></tr>';\n    }).join("") : '<tr><td colspan="5" class="empty-state">Basket is empty. Add products to begin.</td></tr>';\n    card.innerHTML = '<div class="basket-section-head"><h4>Basket <span>(' + basket.length + ' items)</span></h4><button type="button" class="btn btn-ghost" data-action="counter-basket-clear"' + (basket.length ? '' : ' disabled') + '>Clear</button></div><div class="basket-table-wrap"><table class="basket-table"><thead><tr><th>Product</th><th>Unit</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="pos-summary"><div class="pos-summary-row"><span>Subtotal</span><strong>' + money(subtotal) + '</strong></div><div class="pos-summary-row"><span>Discount</span><strong>' + money(discount) + '</strong></div><div class="pos-summary-row"><span>VAT (16%)</span><strong>' + money(vat) + '</strong></div><div class="pos-summary-row"><span>Shipping</span><strong>' + money(shipping) + '</strong></div><div class="pos-summary-row total"><span>Grand Total</span><strong>' + money(total) + '</strong></div></div>';\n  }\n\n  function adjustCounterBasketLine(productId, delta) {\n    const line = state.pos.basket.find(function (item) { return String(item.product_id) === String(productId); });\n    if (!line) return;\n    const product = state.pos.products.find(function (item) { return String(item.id) === String(productId); });\n    const rawStock = product ? (product.current_stock != null ? product.current_stock : (product.stock != null ? product.stock : product.available_stock)) : null;\n    const stockKnown = rawStock != null && rawStock !== "";\n    const next = firstNumber(line.quantity, 0) + delta;\n    if (next <= 0) return removeCounterBasketLine(productId);\n    if (stockKnown && next > firstNumber(rawStock, 0)) { showToast("Cannot exceed available stock.", "error"); return; }\n    line.quantity = next;\n    renderCurrentRoute();\n  }\n\n  function removeCounterBasketLine(productId) {\n    state.pos.basket = state.pos.basket.filter(function (item) { return String(item.product_id) !== String(productId); });\n    renderCurrentRoute();\n  }\n`;
  const insertionPoint = source.indexOf('\n', source.indexOf('}', source.indexOf('function __counterOriginalRenderCurrentRoute(')) + 1);
  if (insertionPoint < 0) throw new Error('Counter patch: renderCurrentRoute insertion point not found');
  source = source.slice(0, insertionPoint) + wrapper + source.slice(insertionPoint);
}

patchActionDispatch();
installBasketRenderer();

fs.writeFileSync(file, source);
console.log('[counter-patch] Counter catalogue, basket, quantity controls, action dispatch, and stock guards installed.');
