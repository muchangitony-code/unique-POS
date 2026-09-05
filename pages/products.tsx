import React, { useState } from 'react';
import { 
  useGetProducts, 
  useCreateProduct, 
  useUpdateProduct, 
  useDeleteProduct,
  useGetCategories,
  useGetBrands,
  useGetSuppliers,
  Product
} from '@workspace/api-client-react';
import { Plus, Search, Pencil, Trash2, Image as ImageIcon, Barcode, Printer, RefreshCw, Wand2, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetProductsQueryKey, customFetch } from '@workspace/api-client-react';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { useAuth } from '@/contexts/AuthContext';
import { getTier } from '@/lib/permissions';

const productSchema = z.object({
  product_code: z.string().min(1, 'Product code is required'),
  product_name: z.string().min(1, 'Product name is required'),
  barcode: z.string().optional(),
  category_id: z.coerce.number().optional(),
  brand_id: z.coerce.number().optional(),
  supplier_id: z.coerce.number().optional(),
  cost_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  vat_rate: z.coerce.number().min(0).optional(),
  current_stock: z.coerce.number().min(0).optional(),
  min_stock: z.coerce.number().min(0).optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  unit: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

/** Generate a Code 128-safe barcode from a product code + numeric id */
function generateBarcode(productCode: string, productId?: number): string {
  const prefix = productCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const suffix = String(productId ?? Math.floor(Math.random() * 90000) + 10000).padStart(8, '0');
  return `${prefix}${suffix}`;
}

/** Escape a string for safe insertion as a text node (no XSS) */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Open a print window with barcode labels for selected products */
function printLabels(products: Product[]) {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to print labels.'); return; }

  // Build label markup using escaped text — no raw user data in HTML context
  const labelHtml = products.map(p => {
    const bc = p.barcode || '';
    return `
      <div class="label">
        <div class="product-name">${escHtml(p.product_name)}</div>
        <div class="product-code">${escHtml(p.product_code)}</div>
        ${bc ? `<svg class="barcode-svg" id="bc-${p.id}"></svg>` : '<div class="no-barcode">No barcode</div>'}
        <div class="price">KES ${escHtml(Number(p.selling_price).toFixed(2))}</div>
      </div>
    `;
  }).join('');

  // Barcode values are serialised via JSON.stringify (produces a quoted JS string literal)
  // so they are safe to emit inside a <script> block.
  const barcodeInits = products
    .filter(p => p.barcode)
    .map(p => `JsBarcode(document.getElementById('bc-${p.id}'), ${JSON.stringify(p.barcode)}, {format:'CODE128',width:2,height:50,fontSize:10,displayValue:true,margin:2,background:'transparent'});`)
    .join('\n');

  // Label count is a plain integer — safe to embed directly
  const labelCount = products.length;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcode Labels</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
    .label {
      width: 200px;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      page-break-inside: avoid;
    }
    .product-name { font-weight: bold; font-size: 11px; text-align: center; }
    .product-code { font-size: 10px; color: #555; }
    .barcode-svg { max-width: 100%; }
    .price { font-size: 13px; font-weight: bold; }
    .no-barcode { font-size: 10px; color: #999; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:12px;background:#f0f0f0;display:flex;gap:8px;align-items:center;">
    <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">\uD83D\uDDB6\uFE0F Print</button>
    <button onclick="window.close()" style="padding:8px 16px;font-size:14px;cursor:pointer;">\u2715 Close</button>
    <span style="font-size:13px;color:#555;">${labelCount} label(s)</span>
  </div>
  <div class="grid">${labelHtml}</div>
  <script>
    window.onload = function() {
      ${barcodeInits}
    };
  \u003c/script>
</body>
</html>`);
  win.document.close();
}

export default function Products() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<Array<{ id: number; product_code: string; product_name: string; barcode: string }> | null>(null);

  const { user } = useAuth();
  const isAdmin = getTier(user?.role) === 'administrator';

  const queryClient = useQueryClient();

  const { data: productsData, isLoading } = useGetProducts({ search });
  const { data: categories } = useGetCategories();
  const { data: brands } = useGetBrands();
  const { data: suppliers } = useGetSuppliers({});

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      product_code: '',
      product_name: '',
      barcode: '',
      cost_price: 0,
      selling_price: 0,
      vat_rate: 16,
      current_stock: 0,
      min_stock: 5,
      image_url: '',
      unit: 'pcs',
    },
  });

  const onSubmit = (data: ProductFormValues) => {
    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data },
        {
          onSuccess: () => {
            toast.success('Product updated successfully');
            queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
            closeDialog();
          },
        }
      );
    } else {
      createProduct.mutate(
        { data },
        {
          onSuccess: () => {
            toast.success('Product created successfully');
            queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
            closeDialog();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this product?')) {
      deleteProduct.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success('Product deleted');
            queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
          },
        }
      );
    }
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset({
      product_code: product.product_code,
      product_name: product.product_name,
      barcode: product.barcode || '',
      category_id: product.category_id || undefined,
      brand_id: product.brand_id || undefined,
      supplier_id: product.supplier_id || undefined,
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      vat_rate: product.vat_rate || 16,
      current_stock: product.current_stock,
      min_stock: product.min_stock,
      image_url: product.image_url || '',
      unit: product.unit || 'pcs',
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingProduct(null);
    form.reset();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = productsData?.data?.map(p => p.id) ?? [];
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handlePrintLabels = () => {
    const selected = productsData?.data?.filter(p => selectedIds.has(p.id)) ?? [];
    if (selected.length === 0) {
      toast.error('Select at least one product to print labels');
      return;
    }
    printLabels(selected);
  };

  const handleGenerateBarcodesForSelected = async () => {
    const selected = productsData?.data?.filter(p => selectedIds.has(p.id)) ?? [];
    const untagged = selected.filter(p => !p.barcode);
    if (untagged.length === 0) {
      toast.info('All selected products already have barcodes.');
      return;
    }
    if (!confirm(`Generate barcodes for ${untagged.length} selected product(s) that don't have one yet?`)) return;
    setIsGenerating(true);
    try {
      const result = await customFetch<{ updated: number; message: string; products?: Array<{ id: number; product_code: string; product_name: string; barcode: string }> }>(
        '/products/generate-barcodes',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_ids: untagged.map(p => p.id) }),
        }
      );
      if (result.updated > 0) {
        queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
        setSelectedIds(new Set());
        // Show the summary modal with the newly tagged products
        if (result.products && result.products.length > 0) {
          setGeneratedSummary(result.products);
        } else {
          toast.success(result.message);
        }
      } else {
        toast.info(result.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate barcodes';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const allSelected =
    (productsData?.data?.length ?? 0) > 0 &&
    selectedIds.size === (productsData?.data?.length ?? 0);

  const currentBarcode = form.watch('barcode');
  const currentProductCode = form.watch('product_code');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-products"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={handlePrintLabels} data-testid="button-print-labels">
              <Printer className="mr-2 h-4 w-4" />
              Print Labels ({selectedIds.size})
            </Button>
          )}

          {isAdmin && selectedIds.size > 0 && (
            <Button
              variant="outline"
              onClick={handleGenerateBarcodesForSelected}
              disabled={isGenerating}
              data-testid="button-generate-barcodes-selected"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {isGenerating ? 'Generating…' : `Generate Barcodes (${selectedIds.size})`}
            </Button>
          )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-product">
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="product_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Code</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="barcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Barcode</FormLabel>
                          <div className="flex gap-2">
                            <FormControl><Input {...field} placeholder="Scan or enter barcode" /></FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              title="Generate barcode from product code"
                              onClick={() => {
                                const code = form.getValues('product_code');
                                const id = editingProduct?.id;
                                const bc = generateBarcode(code || 'PROD', id);
                                form.setValue('barcode', bc);
                              }}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Barcode preview in form */}
                    {currentBarcode && (
                      <div className="sm:col-span-2 flex flex-col items-center gap-1 p-3 bg-muted/40 rounded-lg">
                        <BarcodeDisplay value={currentBarcode} height={50} fontSize={11} />
                      </div>
                    )}
                    <FormField
                      control={form.control}
                      name="product_name"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Product Name</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="category_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories?.map(c => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="brand_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Brand</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select brand" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {brands?.map(b => (
                                <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="supplier_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Supplier</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select supplier" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {suppliers?.data?.map(s => (
                                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit (e.g. pcs, kg, m)</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cost_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost Price (KES)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="selling_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Selling Price (KES)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="current_stock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Initial Stock</FormLabel>
                          <FormControl><Input type="number" {...field} disabled={!!editingProduct} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="min_stock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Stock Alert Level</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="image_url"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Image URL (Optional)</FormLabel>
                          <FormControl><Input type="url" placeholder="https://..." {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="button" variant="outline" className="mr-2" onClick={closeDialog}>Cancel</Button>
                    <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>
                      {editingProduct ? 'Update Product' : 'Create Product'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Barcode generation summary modal */}
      {generatedSummary && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setGeneratedSummary(null); }}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Barcodes Generated — {generatedSummary.length} product{generatedSummary.length !== 1 ? 's' : ''} tagged
              </DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 mt-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Product Name</th>
                    <th className="px-3 py-2 text-left">Barcode</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedSummary.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{p.product_code}</td>
                      <td className="px-3 py-2">{p.product_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.barcode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setGeneratedSummary(null)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  // Build minimal Product-compatible objects for printLabels
                  const toPrint = generatedSummary.map(p => ({
                    id: p.id,
                    product_code: p.product_code,
                    product_name: p.product_name,
                    barcode: p.barcode,
                    selling_price: (productsData?.data?.find(d => d.id === p.id)?.selling_price ?? 0),
                  } as Product));
                  printLabels(toPrint);
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Labels for New Barcodes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
              <tr>
                <th className="px-4 py-3 w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 w-12">Img</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-center">Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b"><td colSpan={11} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : productsData?.data?.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No products found.</td></tr>
              ) : (
                productsData?.data?.map((product) => {
                  const isLowStock = product.current_stock <= product.min_stock;
                  return (
                    <tr key={product.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                          aria-label={`Select ${product.product_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.product_name} className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{product.product_code}</td>
                      <td className="px-4 py-3">{product.product_name}</td>
                      <td className="px-4 py-3">
                        {product.barcode ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <BarcodeDisplay value={product.barcode} height={28} fontSize={9} width={1.5} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{product.category_name || '-'}</td>
                      <td className="px-4 py-3">{product.brand_name || '-'}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(product.cost_price)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(product.selling_price)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={isLowStock ? "destructive" : "secondary"}>
                          {product.current_stock} {product.unit}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)} data-testid={`edit-product-${product.id}`}>
                          <Pencil className="w-4 h-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} data-testid={`delete-product-${product.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
