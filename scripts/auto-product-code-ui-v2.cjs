"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "pages/products.tsx");
let source = fs.readFileSync(file, "utf8");

// Make product code automatic for new products. Existing product codes are preserved.
source = source.replace(
  /product_code:\s*z\.string\(\)\.min\(1,\s*['\"]Product code is required['\"]\)/,
  "product_code: z.string().default('AUTO')"
);
source = source.replace(/product_code:\s*['\"]['\"],/, "product_code: 'AUTO',");
source = source.replace(
  /<FormLabel>Product Code<\/FormLabel>\s*<FormControl><Input \{\.\.\.field\} \/><\/FormControl>/,
  "<FormLabel>Product Code</FormLabel>\n                          <FormControl><Input {...field} value={editingProduct ? field.value : 'Automatic'} readOnly /></FormControl>"
);
source = source.replace(
  /const onSubmit = \(data: ProductFormValues\) => \{/,
  "const onSubmit = (data: ProductFormValues) => {\n    const payload: ProductFormValues = { ...data, product_code: editingProduct ? data.product_code : 'AUTO' };"
);
source = source.replace(/\{ id: editingProduct\.id, data \}/g, "{ id: editingProduct.id, data: payload }");
source = source.replace(/\{ data \}/g, "{ data: payload }");

fs.writeFileSync(file, source, "utf8");
console.log("[auto-product-code-ui-v2] Product Code is automatic for new products.");
