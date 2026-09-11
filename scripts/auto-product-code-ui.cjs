"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "pages/products.tsx");
let source = fs.readFileSync(file, "utf8");

const replacements = [
  [
    "product_code: '',",
    "product_code: 'AUTO',",
  ],
  [
    "<FormLabel>Product Code</FormLabel>\n                          <FormControl><Input {...field} /></FormControl>",
    "<FormLabel>Product Code (Auto-generated)</FormLabel>\n                          <FormControl><Input {...field} value={field.value === 'AUTO' ? 'Generated automatically on save' : field.value} readOnly /></FormControl>",
  ],
  [
    "const code = form.getValues('product_code');\n                                const id = editingProduct?.id;",
    "const rawCode = form.getValues('product_code');\n                                const code = rawCode === 'AUTO' ? 'PROD' : rawCode;\n                                const id = editingProduct?.id;",
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replace(from, to);
}

fs.writeFileSync(file, source, "utf8");
console.log("[auto-product-code-ui] Products form patched for automatic Product Code generation.");
