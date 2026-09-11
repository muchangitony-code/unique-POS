const fs = require('fs');
const path = require('path');

const file = path.resolve(process.cwd(), 'public/app.js');
let source = fs.readFileSync(file, 'utf8');

const anchor = "    const photos = state.productWorkspace.editor.photos || [];\n    return '<form id=\"productEditorForm\"";
if (!source.includes(anchor)) {
  throw new Error('[product-category-free-entry-ui] product editor anchor not found');
}

const categoryPattern = new RegExp("'<label><span>Category</span><select id=\"productCategorySelect\" name=\"category_id\">[\\s\\S]*?</select></label>'");
if (!categoryPattern.test(source)) {
  throw new Error('[product-category-free-entry-ui] catalogue category selector not found');
}

const categoryValueMarker = "    const categoryValue = product ? firstText(product.category_name, (categories.find(function(item) { return String(item.id) === String(product.category_id); }) || {}).name, '') : '';\n";
if (!source.includes('const categoryValue = product ? firstText(product.category_name')) {
  source = source.replace(
    "    const photos = state.productWorkspace.editor.photos || [];\n",
    "    const photos = state.productWorkspace.editor.photos || [];\n" + categoryValueMarker
  );
}

const replacement = `'<label><span>Category</span><input id="productCategoryInput" name="category" list="productCategoryOptions" value="' + escapeAttr(categoryValue) + '" placeholder="Type a category or choose existing" autocomplete="off" required /><datalist id="productCategoryOptions">' + categories.map(function(item) { return '<option value="' + escapeAttr(firstText(item.name, 'Category')) + '"></option>'; }).join('') + '</datalist><small class="field-hint">Type a new category if it is not in the list; it will be created automatically.</small></label>'`;

source = source.replace(categoryPattern, replacement);
fs.writeFileSync(file, source);
console.log('[product-category-free-entry-ui] Product category now supports direct typing with existing-category suggestions.');
