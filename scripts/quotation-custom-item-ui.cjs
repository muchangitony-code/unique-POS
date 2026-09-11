"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(process.cwd(), "components/documents/DocumentWizard.tsx");
let source = fs.readFileSync(file, "utf8");

// The quotation wizard supports catalogue products and, for quotations only,
// ad-hoc non-stock/custom lines. Custom lines use product_id = null so they
// never create or alter inventory records.
source = source.replace(
  /<ProductsStep state=\{state\} patch=\{patch\} \/>/,
  "<ProductsStep state={state} patch={patch} allowNonStock={isQuote} />"
);

const start = source.indexOf("// ── Step 2: Products");
const end = source.indexOf("// ── Step 3: Pricing");
if (start < 0 || end < 0 || end <= start) {
  throw new Error("[quotation-custom-item-ui] ProductsStep markers not found");
}

const replacement = String.raw`// ── Step 2: Products ──────────────────────────────────────────────────────────
function ProductsStep({ state, patch, allowNonStock = false }: { state: WizardState; patch: (p: Partial<WizardState>) => void; allowNonStock?: boolean }) {
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customPrice, setCustomPrice] = useState('0');
  const [customVat, setCustomVat] = useState('16');
  const { data: productsData, isLoading } = useGetProducts({ search: search || undefined, limit: 30 });

  const addProduct = (p: Product) => {
    const existing = state.lines.find((l) => l.product_id === p.id);
    if (existing) {
      patch({ lines: state.lines.map((l) => l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l) });
      return;
    }
    patch({ lines: [...state.lines, {
      product_id: p.id,
      product_name: p.product_name,
      description: p.description ?? '',
      unit: p.unit ?? '',
      quantity: 1,
      unit_price: Number(p.selling_price ?? 0),
      discount: 0,
      vat_rate: Number((p as any).vat_rate ?? 16),
    }] });
  };

  const addCustomItem = () => {
    const name = customName.trim();
    const quantity = Number(customQty);
    const price = Number(customPrice);
    const vat = Number(customVat);
    if (!name) { toast.error('Enter the custom item name'); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast.error('Quantity must be greater than zero'); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error('Unit price cannot be negative'); return; }
    if (!Number.isFinite(vat) || vat < 0) { toast.error('VAT rate cannot be negative'); return; }

    patch({ lines: [...state.lines, {
      product_id: null as any,
      product_name: name,
      description: customDescription.trim() || name,
      unit: customUnit.trim(),
      quantity,
      unit_price: price,
      discount: 0,
      vat_rate: vat,
    }] });
    setCustomName('');
    setCustomDescription('');
    setCustomUnit('');
    setCustomQty('1');
    setCustomPrice('0');
    setCustomVat('16');
    setCustomOpen(false);
  };

  const handleBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    setBarcode('');
    try {
      const res = await fetch(\`${getApiUrl()}products/barcode/\${encodeURIComponent(code)}\`, { credentials: 'include' });
      if (res.status === 404) { toast.error(\`No product for barcode \${code}\`); return; }
      if (!res.ok) throw new Error('Barcode lookup failed');
      addProduct(await res.json());
    } catch (err: any) {
      toast.error(err?.message || 'Barcode lookup failed');
    }
  };

  const updateLine = (index: number, patchLine: Partial<DocLine>) => {
    patch({ lines: state.lines.map((l, i) => i === index ? { ...l, ...patchLine } : l) });
  };

  const removeLine = (index: number) => patch({ lines: state.lines.filter((_, i) => i !== index) });

  return (
    <div className="space-y-5">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-52">
          <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Barcode + Enter" className="pl-9 font-mono" value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleBarcode(); } }} />
        </div>
        {allowNonStock && (
          <Button type="button" variant="outline" onClick={() => setCustomOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Non-stock / Custom Item
          </Button>
        )}
      </div>

      {allowNonStock && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground bg-muted/20">
          Need to quote something that is not in inventory? Use <span className="font-medium text-foreground">Non-stock / Custom Item</span>. It appears on the quotation but does not create stock or inventory records.
        </div>
      )}

      <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
        {isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          : (productsData?.data ?? []).length === 0 ? <p className="p-3 text-sm text-muted-foreground">No products found.</p>
          : productsData!.data!.map((p) => (
            <button key={p.id} type="button" onClick={() => addProduct(p)} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{p.product_name}</p>
                <p className="text-xs text-muted-foreground">{p.product_code || 'No code'} · Stock: {p.current_stock ?? 0}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">{formatCurrency(Number(p.selling_price ?? 0))}</p>
                <p className="text-xs text-primary">Add</p>
              </div>
            </button>
          ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Selected items</h3>
          <Badge variant="secondary">{state.lines.length} item{state.lines.length === 1 ? '' : 's'}</Badge>
        </div>
        {state.lines.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg">No items added yet.</div>
        ) : (
          <div className="space-y-2">
            {state.lines.map((line, index) => (
              <div key={`${line.product_id ?? 'custom'}-${index}`} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{line.product_name}</p>
                      {line.product_id == null && <Badge variant="outline" className="shrink-0">NON-STOCK</Badge>}
                    </div>
                    {line.description && <p className="text-xs text-muted-foreground mt-0.5">{line.description}</p>}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(index)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <div><label className="text-xs text-muted-foreground">Quantity</label><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-muted-foreground">Unit</label><Input value={line.unit ?? ''} onChange={(e) => updateLine(index, { unit: e.target.value })} /></div>
                  <div><label className="text-xs text-muted-foreground">Unit price</label><Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(index, { unit_price: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-muted-foreground">Discount %</label><Input type="number" min="0" step="0.01" value={line.discount} onChange={(e) => updateLine(index, { discount: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-muted-foreground">VAT %</label><Input type="number" min="0" step="0.01" value={line.vat_rate} onChange={(e) => updateLine(index, { vat_rate: Number(e.target.value) })} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {allowNonStock && (
        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Non-stock / Custom Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">This line is only for the quotation. It will not be added to Products, stock, or inventory.</p>
              <div><label className="text-sm font-medium">Item name *</label><Input autoFocus placeholder="e.g. Custom fabrication" value={customName} onChange={(e) => setCustomName(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Description</label><Textarea placeholder="Optional description/specification" value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Unit</label><Input placeholder="pcs, m, service…" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} /></div>
                <div><label className="text-sm font-medium">Quantity *</label><Input type="number" min="0.001" step="0.001" value={customQty} onChange={(e) => setCustomQty(e.target.value)} /></div>
                <div><label className="text-sm font-medium">Unit price (KES) *</label><Input type="number" min="0" step="0.01" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} /></div>
                <div><label className="text-sm font-medium">VAT %</label><Input type="number" min="0" step="0.01" value={customVat} onChange={(e) => setCustomVat(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>Cancel</Button>
              <Button type="button" onClick={addCustomItem}>Add to Quotation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source, "utf8");
console.log("[quotation-custom-item-ui] Non-stock/custom quotation lines enabled.");
