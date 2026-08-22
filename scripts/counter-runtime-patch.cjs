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
    if (stockKnown && stock <= 0) { showToast("This product is out of stock in the selected branch.", "error"); return; }
    const existing = state.pos.basket.find(function (line) { return String(line.product_id) === String(productId); });
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

fs.writeFileSync(file, source);
console.log('[counter-patch] Counter product visibility, Add to Basket, and stock guards installed.');
