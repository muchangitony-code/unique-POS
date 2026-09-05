import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  useGetProducts, 
  useGetCustomers, 
  useCreateSale,
  Product,
  SalePaymentMethod
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Minus, Trash2, ShoppingCart, User, CreditCard, Barcode, Camera, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiUrl } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { ReturnsDialog } from '@/components/pos/ReturnsDialog';
import { useGetSettings } from '@workspace/api-client-react';
import { printReceipt, toPaymentDetails } from '@/lib/printDoc';
import { getBranding, brandingForBranch } from '@/lib/company';
import { useBranchLookup } from '@/lib/branchLookup';

interface CartItem {
  product: Product;
  quantity: number;
}

type BarcodeResult =
  | { ok: true; product: Product }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string };

/** Lookup a product by barcode via the API */
async function lookupByBarcode(barcode: string): Promise<BarcodeResult> {
  try {
    const res = await fetch(`${getApiUrl()}products/barcode/${encodeURIComponent(barcode)}`, {
      credentials: 'include',
    });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) return { ok: false, notFound: false, message: `Server error (${res.status})` };
    const product: Product = await res.json();
    return { ok: true, product };
  } catch {
    return { ok: false, notFound: false, message: 'Network error — check your connection' };
  }
}

export default function POS() {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [receiptData, setReceiptData] = useState<any>(null);
  const [returnsOpen, setReturnsOpen] = useState(false);

  // Barcode scanner input
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);

  // Camera device selection
  const CAMERA_PREF_KEY = 'pos_preferred_camera_device';
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);

  const { data: productsData, isLoading: productsLoading } = useGetProducts({ search, limit: 50 });
  const { data: customersData } = useGetCustomers({ limit: 100 });
  const { data: settings } = useGetSettings();
  const branchMap = useBranchLookup();
  const receiptBranding = receiptData
    ? brandingForBranch(getBranding(), branchMap.get(receiptData.branch_id), 'receipt')
    : getBranding();
  const createSale = useCreateSale();
  const queryClient = useQueryClient();

  const addToCart = useCallback((product: Product) => {
    if (product.current_stock <= 0) {
      toast.error('Product is out of stock');
      return;
    }
    setCart((prev) => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.current_stock) {
          toast.error(`Only ${product.current_stock} available in stock`);
          return prev;
        }
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) => prev.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty > item.product.current_stock) {
          toast.error(`Only ${item.product.current_stock} available`);
          return item;
        }
        if (newQty <= 0) return item;
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + (item.product.selling_price * item.quantity), 0);
    return { subtotal, total: subtotal };
  }, [cart]);

  const amountPaid = parseFloat(amountPaidInput) || totals.total;
  const change = amountPaid - totals.total;

  const handleCheckout = () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (amountPaid < totals.total && paymentMethod !== 'credit') {
      toast.error("Amount paid is less than total"); return;
    }
    createSale.mutate({
      data: {
        customer_id: customerId ? parseInt(customerId) : undefined,
        payment_method: paymentMethod,
        amount_paid: amountPaid,
        discount_amount: 0,
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.product.selling_price,
          vat_rate: item.product.vat_rate || 0
        }))
      }
    }, {
      onSuccess: (res) => {
        toast.success("Sale completed successfully");
        setReceiptData(res);
        setCart([]);
        setAmountPaidInput('');
        setCustomerId('');
        // Refresh product stock, dashboard stats, and any other stale views
        queryClient.invalidateQueries();
      }
    });
  };

  /** Handle barcode scanner input (USB scanner ends with Enter key) */
  const handleBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (!code) return;
      setBarcodeInput('');
      await handleBarcodeLookup(code);
    }
  };

  const handleBarcodeLookup = useCallback(async (code: string) => {
    const result = await lookupByBarcode(code);
    if (!result.ok) {
      if (result.notFound) {
        toast.error(`No product found for barcode: ${code}`);
      } else {
        toast.error(result.message);
      }
      return;
    }
    const { product } = result;
    if (product.current_stock <= 0) {
      toast.error(`${product.product_name} is out of stock`);
      return;
    }
    addToCart(product);
    toast.success(`Added: ${product.product_name}`);
  }, [addToCart]);

  /** Start camera scanning — enumerate devices then open modal */
  const startCameraScanner = async () => {
    try {
      // Request permission first so enumerateDevices returns labels
      await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameraDevices(videoDevices);

      // Restore saved preference, fall back to default if not available
      const saved = localStorage.getItem(CAMERA_PREF_KEY) ?? undefined;
      const available = saved && videoDevices.some(d => d.deviceId === saved) ? saved : videoDevices[0]?.deviceId;
      setSelectedDeviceId(available);
    } catch {
      setCameraDevices([]);
      setSelectedDeviceId(undefined);
    }
    setIsScanningCamera(true);
  };

  /** When user picks a different camera, persist and restart the reader */
  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    localStorage.setItem(CAMERA_PREF_KEY, deviceId);
    // Restart scanner with new device
    if (scannerRef.current) {
      try { scannerRef.current.reset(); } catch {}
      scannerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isScanningCamera) return;

    let stopped = false;
    let codeReader: any = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        codeReader = new BrowserMultiFormatReader();
        scannerRef.current = codeReader;

        if (!videoRef.current || stopped) return;

        // Use selected device (undefined = ZXing default)
        const deviceId = selectedDeviceId || undefined;

        await codeReader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          async (result: any, err: any) => {
            if (stopped) return;
            if (result) {
              const code = result.getText();
              stopCameraScanner();
              await handleBarcodeLookup(code);
            }
          }
        );
      } catch (err: any) {
        if (!stopped) {
          toast.error('Camera access denied or not available');
          setIsScanningCamera(false);
        }
      }
    })();

    return () => {
      stopped = true;
      if (codeReader) {
        try { codeReader.reset(); } catch {}
      }
    };
  }, [isScanningCamera, selectedDeviceId]);

  const stopCameraScanner = () => {
    if (scannerRef.current) {
      try { scannerRef.current.reset(); } catch {}
      scannerRef.current = null;
    }
    setIsScanningCamera(false);
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* Products Section */}
      <div className="flex-1 flex flex-col bg-muted/20 border-r">
        <div className="p-4 bg-background border-b shadow-sm z-10 flex flex-col gap-3">
          {/* Barcode scanner input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                ref={barcodeInputRef}
                placeholder="Scan barcode or type barcode + Enter..."
                className="pl-9 bg-amber-50/60 border-amber-200 h-10 font-mono"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                data-testid="input-barcode-scanner"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              title="Scan with camera"
              onClick={startCameraScanner}
              data-testid="button-camera-scan"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              title="Process a return"
              onClick={() => setReturnsOpen(true)}
              data-testid="button-returns"
            >
              Returns
            </Button>
            <ReturnsDialog open={returnsOpen} onOpenChange={setReturnsOpen} />
          </div>

          {/* Product name/code search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search products by name or code..." 
              className="pl-9 bg-muted/50 border-none h-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
            {productsLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
              ))
            ) : productsData?.data?.map((product) => (
              <div 
                key={product.id} 
                onClick={() => addToCart(product)}
                className={`bg-card border rounded-xl p-4 cursor-pointer hover:border-primary transition-all hover:shadow-md flex flex-col justify-between h-36 ${product.current_stock <= 0 ? 'opacity-50 select-none grayscale' : ''}`}
                data-testid={`pos-product-${product.id}`}
              >
                <div>
                  <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{product.product_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{product.product_code}</p>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <span className="font-bold text-primary">{formatCurrency(product.selling_price)}</span>
                  <Badge variant={product.current_stock > 0 ? "secondary" : "destructive"} className="text-[10px] px-1">
                    {product.current_stock} {product.unit}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cart Section */}
      <div className="w-full md:w-[400px] flex flex-col bg-card shadow-xl z-20">
        <div className="p-4 border-b bg-sidebar text-sidebar-foreground flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Current Order
          </h2>
          <Badge variant="secondary" className="bg-sidebar-accent text-sidebar-accent-foreground border-none">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </Badge>
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-60 mt-20">
              <ShoppingCart className="h-16 w-16 mb-4" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.product.id} className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg border">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">{item.product.product_name}</span>
                    <span className="font-semibold text-sm">{formatCurrency(item.product.selling_price * item.quantity)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{formatCurrency(item.product.selling_price)} / {item.product.unit}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.product.id, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(item.product.id, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive ml-1" onClick={() => removeFromCart(item.product.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 bg-muted/20 border-t space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Walk-in Customer (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Walk-in Customer</SelectItem>
                  {customersData?.data?.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as SalePaymentMethod)}>
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="credit">Credit (Unpaid)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {paymentMethod === 'cash' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-6">KES</span>
                <Input 
                  type="number" 
                  placeholder="Amount Tendered" 
                  value={amountPaidInput}
                  onChange={(e) => setAmountPaidInput(e.target.value)}
                  className="flex-1 h-9"
                />
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>Included</span>
            </div>
            {paymentMethod === 'cash' && amountPaidInput && amountPaid >= totals.total && (
              <div className="flex justify-between text-primary font-medium">
                <span>Change</span>
                <span>{formatCurrency(change)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold pt-2 border-t">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <Button 
            className="w-full h-12 text-lg font-bold" 
            size="lg" 
            onClick={handleCheckout}
            disabled={cart.length === 0 || createSale.isPending}
            data-testid="button-complete-sale"
          >
            {createSale.isPending ? "Processing..." : `Charge ${formatCurrency(totals.total)}`}
          </Button>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      <Dialog open={isScanningCamera} onOpenChange={(open) => { if (!open) stopCameraScanner(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" /> Scan Barcode with Camera
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Camera device selector — only shown when multiple cameras exist */}
            {cameraDevices.length > 1 && (
              <Select
                value={selectedDeviceId ?? ''}
                onValueChange={(id) => handleDeviceChange(id)}
              >
                <SelectTrigger className="w-full h-9" data-testid="camera-device-select">
                  <Camera className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Select camera…" />
                </SelectTrigger>
                <SelectContent>
                  {cameraDevices.map((dev, i) => (
                    <SelectItem key={dev.deviceId} value={dev.deviceId}>
                      {dev.label || `Camera ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-32 border-2 border-amber-400 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-amber-400 rounded-tl" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-amber-400 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-amber-400 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-amber-400 rounded-br" />
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-amber-400/70 animate-pulse" />
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Point the camera at a barcode — it will be detected automatically.
            </p>
            <Button variant="outline" className="w-full" onClick={stopCameraScanner}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={!!receiptData} onOpenChange={() => setReceiptData(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Receipt</span>
              {receiptData && (
                <button
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  onClick={() =>
                    printReceipt({
                      receipt_number:  receiptData.receipt_number,
                      cashier_name:    receiptData.cashier_name,
                      customer_name:   receiptData.customer_name,
                      created_at:      receiptData.created_at,
                      payment_method:  receiptData.payment_method,
                      items:           receiptData.items,
                      subtotal:        receiptData.subtotal ?? receiptData.total,
                      discount_amount: receiptData.discount_amount ?? 0,
                      total:           receiptData.total,
                      amount_paid:     receiptData.amount_paid,
                      change:          receiptData.change,
                      payment:         toPaymentDetails(settings),
                    }, branchMap.get(receiptData.branch_id))
                  }
                >
                  🖨 Print
                </button>
              )}
            </DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4 font-mono text-sm py-4">
              {/* Branded header */}
              <div className="text-center space-y-1 border-b border-dashed pb-4">
                <img
                  src={receiptBranding.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 object-contain mx-auto rounded"
                />
                <p className="font-bold text-base text-primary">{receiptBranding.name}</p>
                <p className="text-xs text-muted-foreground">{receiptBranding.addressLine}</p>
                <p className="text-xs text-muted-foreground">{receiptBranding.phone}</p>
                <div className="pt-2 space-y-0.5">
                  <p>Receipt #: {receiptData.receipt_number}</p>
                  <p className="text-muted-foreground">{new Date(receiptData.created_at).toLocaleString('en-KE')}</p>
                  <p className="text-muted-foreground">Cashier: {receiptData.cashier_name || 'Staff'}</p>
                </div>
              </div>
              
              <div className="space-y-2 border-b border-dashed pb-4">
                <div className="flex font-bold border-b border-dashed pb-1">
                  <span className="flex-1">Item</span>
                  <span className="w-10 text-right">Qty</span>
                  <span className="w-20 text-right">Total</span>
                </div>
                {receiptData.items.map((item: any, i: number) => (
                  <div key={i} className="flex">
                    <span className="flex-1 truncate pr-2">{item.product_name}</span>
                    <span className="w-10 text-right">{item.quantity}</span>
                    <span className="w-20 text-right">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                {(receiptData.discount_amount > 0) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span>- {formatCurrency(receiptData.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-dashed pt-2">
                  <span>TOTAL</span>
                  <span>{formatCurrency(receiptData.total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Paid ({receiptData.payment_method})</span>
                  <span>{formatCurrency(receiptData.amount_paid)}</span>
                </div>
                {receiptData.change > 0 && (
                  <div className="flex justify-between font-medium text-green-600">
                    <span>Change</span>
                    <span>{formatCurrency(receiptData.change)}</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-4 border-t border-dashed text-muted-foreground">
                <p className="font-medium text-primary">
                  {receiptBranding.documentFooter || `Thank you for choosing ${receiptBranding.name}!`}
                </p>
                <p className="text-xs mt-1">KRA PIN: {receiptBranding.kraPin}</p>
              </div>

              <Button className="w-full mt-2" onClick={() => setReceiptData(null)}>
                New Sale
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
