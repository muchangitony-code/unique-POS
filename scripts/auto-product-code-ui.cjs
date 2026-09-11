"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "pages/products.tsx");
let source = fs.readFileSync(file, "utf8");

const replacements = [
  [
    "import React, { useState } from 'react';",
    "import React, { useEffect, useState } from 'react';",
  ],
  [
    "type ProductFormValues = z.infer<typeof productSchema>;\n\n/** Generate a Code 128-safe barcode from a product code + numeric id */",
    "type ProductFormValues = z.infer<typeof productSchema>;\n\n/** Generate the same category/name-based SKU format used by the existing bulk importer. */\nfunction generateAutoProductCode(categoryName: string | undefined, productName: string, existingCodes: string[], totalCount: number): string {\n  const catPrefix = (categoryName || 'GEN').trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'GEN';\n  const nameSlug = (productName || 'PRODUCT').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20).toUpperCase() || 'PRODUCT';\n  const base = `${catPrefix}-${nameSlug}`;\n  const used = new Set(existingCodes.map((code) => String(code || '').trim().toUpperCase()));\n  let next = Math.max(1, Number(totalCount || 0) + 1);\n  let candidate = `${base}-${String(next).padStart(3, '0')}`.slice(0, 64);\n  while (used.has(candidate.toUpperCase())) {\n    next += 1;\n    candidate = `${base}-${String(next).padStart(3, '0')}`.slice(0, 64);\n  }\n  return candidate;\n}\n\n/** Generate a Code 128-safe barcode from a product code + numeric id */",
  ],
  [
    "product_code: 'AUTO',",
    "product_code: 'GEN-PRODUCT-001',",
  ],
  [
    "const currentBarcode = form.watch('barcode');\n  const currentProductCode = form.watch('product_code');",
    "const currentBarcode = form.watch('barcode');\n  const currentProductCode = form.watch('product_code');\n  const currentProductName = form.watch('product_name');\n  const currentCategoryId = form.watch('category_id');\n\n  useEffect(() => {\n    if (editingProduct) return;\n    const categoryName = categories?.find((c) => c.id === Number(currentCategoryId))?.name;\n    const existingCodes = productsData?.data?.map((p) => p.product_code) ?? [];\n    const generatedCode = generateAutoProductCode(categoryName, currentProductName, existingCodes, productsData?.total ?? 0);\n    if (form.getValues('product_code') !== generatedCode) {\n      form.setValue('product_code', generatedCode, { shouldValidate: true });\n    }\n  }, [editingProduct, currentProductName, currentCategoryId, categories, productsData?.data, productsData?.total, form]);",
  ],
  [
    "<FormLabel>Product Code</FormLabel>\n                          <FormControl><Input {...field} /></FormControl>",
    "<FormLabel>Product Code (Auto-generated)</FormLabel>\n                          <FormControl><Input {...field} readOnly /></FormControl>",
  ],
  [
    "const code = form.getValues('product_code');\n                                const id = editingProduct?.id;",
    "const code = form.getValues('product_code');\n                                const id = editingProduct?.id;",
  ],
];

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replace(from, to);
}

fs.writeFileSync(file, source, "utf8");
console.log("[auto-product-code-ui] Products form patched for automatic Product Code generation.");
