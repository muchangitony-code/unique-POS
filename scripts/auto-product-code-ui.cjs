"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "pages/products.tsx");
let source = fs.readFileSync(file, "utf8");

// The Product Code is system-generated. Keep the form's internal value non-empty
// so existing Zod/API contracts remain intact, while presenting it as automatic.
source = source.replace(
  /product_code:\s*z\.string\(\)\.min\(1,\s*['\"]Product code is required['\"]\)/,
  "product_code: z.string().default('AUTO')"
);
source = source.replace(
  /product_code:\s*['\"]['\"],/,
  "product_code: 'AUTO',"
);
source = source.replace(
  /<FormLabel>Product Code<\/FormLabel>\s*<FormControl><Input \{\.\.\.field\} \/><\/FormControl>/,
  "<FormLabel>Product Code</FormLabel>\n                          <FormControl><Input {...field} value=\"Automatic\" readOnly /></FormControl>"
);

// Guarantee AUTO is sent to the server even if a browser restores an old blank value.
source = source.replace(
  /const onSubmit = \(data: ProductFormValues\) => \{/,
  "const onSubmit = (data: ProductFormValues) => {\n    const payload: ProductFormValues = { ...data, product_code: data.product_code?.trim() || 'AUTO' };"
);
source = source.replace(/\{ id: editingProduct\.id, data \}/g, "{ id: editingProduct.id, data: payload }");
source = source.replace(/\{ data \}/g, "{ data: payload }");

fs.writeFileSync(file, source, "utf8");
console.log("[auto-product-code-ui] Product Code is automatic; blank-code validation removed for new products.");
