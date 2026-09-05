import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  useUpdateBrandingSettings,
  useRequestUploadUrl,
  getGetSettingsQueryKey,
  getGetBrandingQueryKey,
} from '@workspace/api-client-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Palette, ImageIcon, FileText, ShieldCheck, Upload, Loader2, X, Type } from 'lucide-react';
import { resolveAssetUrl } from '@/lib/company';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FONT_OPTIONS, fontStack, loadFont } from '@/lib/fonts';

// Branding fields managed here. Company name/email/phone/address/tax and receipt
// footer are edited on the Business Settings tab to avoid duplication.
const brandingSchema = z.object({
  tagline: z.string().optional(),
  website: z.string().optional(),
  vat_number: z.string().optional(),
  business_phone2: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  body_font: z.string().optional(),
  heading_font: z.string().optional(),
  logo_url: z.string().optional(),
  stamp_url: z.string().optional(),
  signature_url: z.string().optional(),
  document_footer: z.string().optional(),
  warranty_text: z.string().optional(),
  return_policy: z.string().optional(),
  quotation_validity_days: z.union([z.number(), z.nan()]).optional(),
  invoice_payment_terms: z.string().optional(),
});

type BrandingFormValues = z.infer<typeof brandingSchema>;

export interface BrandingSettingsData {
  tagline?: string | null;
  website?: string | null;
  vat_number?: string | null;
  business_phone2?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  body_font?: string | null;
  heading_font?: string | null;
  logo_url?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  document_footer?: string | null;
  warranty_text?: string | null;
  return_policy?: string | null;
  quotation_validity_days?: number | null;
  invoice_payment_terms?: string | null;
}

const DEFAULT_PRIMARY = '#1B4DA5';
const DEFAULT_SECONDARY = '#F5A500';

// ─── Image upload field ──────────────────────────────────────────────────────
function ImageUploadField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string | undefined;
  onChange: (objectPath: string) => void;
}) {
  const requestUpload = useRequestUploadUrl();
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewUrl = value ? resolveAssetUrl(value) : null;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5 MB');
      return;
    }
    setUploading(true);
    try {
      const ticket = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, content_type: file.type },
      });
      const put = await fetch(ticket.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      onChange(ticket.object_path);
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl ? (
            <img src={previewUrl} alt={label} className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange('')}>
                <X className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Colour picker ────────────────────────────────────────────────────────────
function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (hex: string) => void;
}) {
  const current = value || fallback;
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 rounded-md border border-border cursor-pointer bg-transparent p-1"
        />
        <Input
          value={value ?? ''}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono uppercase max-w-[140px]"
        />
      </div>
    </FormItem>
  );
}

// ─── Font picker ──────────────────────────────────────────────────────────────
function FontField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (font: string) => void;
}) {
  // Preload every option so the live preview renders in the real typeface.
  React.useEffect(() => {
    FONT_OPTIONS.forEach((f) => loadFont(f.value));
  }, []);
  const current = value || 'Inter';
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              <span style={{ fontFamily: f.stack }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormItem>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export function BrandingPanel({ settings }: { settings: BrandingSettingsData | undefined }) {
  const updateSettings = useUpdateBrandingSettings();
  const queryClient = useQueryClient();

  const form = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      tagline: '', website: '', vat_number: '', business_phone2: '',
      primary_color: '', secondary_color: '', body_font: '', heading_font: '',
      logo_url: '', stamp_url: '', signature_url: '',
      document_footer: '', warranty_text: '', return_policy: '',
      quotation_validity_days: undefined, invoice_payment_terms: '',
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset({
        tagline: settings.tagline ?? '',
        website: settings.website ?? '',
        vat_number: settings.vat_number ?? '',
        business_phone2: settings.business_phone2 ?? '',
        primary_color: settings.primary_color ?? '',
        secondary_color: settings.secondary_color ?? '',
        body_font: settings.body_font ?? '',
        heading_font: settings.heading_font ?? '',
        logo_url: settings.logo_url ?? '',
        stamp_url: settings.stamp_url ?? '',
        signature_url: settings.signature_url ?? '',
        document_footer: settings.document_footer ?? '',
        warranty_text: settings.warranty_text ?? '',
        return_policy: settings.return_policy ?? '',
        quotation_validity_days: settings.quotation_validity_days ?? undefined,
        invoice_payment_terms: settings.invoice_payment_terms ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: BrandingFormValues) => {
    const days = data.quotation_validity_days;
    const payload = {
      ...data,
      quotation_validity_days: days === undefined || Number.isNaN(days) ? undefined : Number(days),
    };
    updateSettings.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast.success('Branding saved — changes are live everywhere');
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBrandingQueryKey() });
        },
        onError: (err) => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            These branding settings appear on every quotation, invoice, receipt, PDF export,
            email, the sidebar and the login screen. Changes take effect immediately for everyone —
            no redeploy needed. Company name, address, phone, email and KRA PIN are edited on the
            Business Settings tab.
          </p>
        </div>

        {/* Brand assets */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><ImageIcon className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Brand Assets</CardTitle>
                <CardDescription>Logo, company stamp and authorized signature.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField control={form.control} name="logo_url" render={({ field }) => (
              <ImageUploadField label="Company Logo" description="Shown on documents, sidebar and the login page. PNG or JPG, up to 5 MB." value={field.value} onChange={field.onChange} />
            )} />
            <FormField control={form.control} name="stamp_url" render={({ field }) => (
              <ImageUploadField label="Company Stamp" description="Placed on printed quotations and invoices. A transparent PNG works best." value={field.value} onChange={field.onChange} />
            )} />
            <FormField control={form.control} name="signature_url" render={({ field }) => (
              <ImageUploadField label="Authorized Signature" description="Shown in the 'Authorized/Prepared By' area of documents." value={field.value} onChange={field.onChange} />
            )} />
          </CardContent>
        </Card>

        {/* Theme colours */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Palette className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Theme Colours</CardTitle>
                <CardDescription>Primary and secondary colours applied across the app and documents.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="primary_color" render={({ field }) => (
              <ColorField label="Primary Colour" value={field.value} fallback={DEFAULT_PRIMARY} onChange={field.onChange} />
            )} />
            <FormField control={form.control} name="secondary_color" render={({ field }) => (
              <ColorField label="Secondary / Accent Colour" value={field.value} fallback={DEFAULT_SECONDARY} onChange={field.onChange} />
            )} />
          </CardContent>
        </Card>

        {/* Typography */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Type className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Typography</CardTitle>
                <CardDescription>Default fonts used across the app and on printed documents.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="body_font" render={({ field }) => (
                <FontField label="Body Font" value={field.value} onChange={field.onChange} />
              )} />
              <FormField control={form.control} name="heading_font" render={({ field }) => (
                <FontField label="Heading Font" value={field.value} onChange={field.onChange} />
              )} />
            </div>
            {/* Live preview */}
            <div className="rounded-lg border bg-muted/30 p-5 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Live preview</p>
              <p className="text-2xl font-bold" style={{ fontFamily: fontStack(form.watch('heading_font')) }}>
                {settings?.tagline || 'Unique Solar Kenya Ltd'}
              </p>
              <p className="text-sm text-muted-foreground" style={{ fontFamily: fontStack(form.watch('body_font')) }}>
                The quick brown fox jumps over the lazy dog. 0123456789 — invoices, quotations and receipts will use these fonts.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Company details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Company Details</CardTitle>
                <CardDescription>Extra identity shown on branded documents.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="tagline" render={({ field }) => (
              <FormItem><FormLabel>Tagline</FormLabel><FormControl><Input placeholder="e.g. Your Trusted Solar Energy Partner" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="website" render={({ field }) => (
              <FormItem><FormLabel>Website</FormLabel><FormControl><Input placeholder="e.g. www.uniquesolarkenya.co.ke" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="business_phone2" render={({ field }) => (
              <FormItem><FormLabel>Secondary Phone</FormLabel><FormControl><Input placeholder="e.g. +254 700 000 000" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="vat_number" render={({ field }) => (
              <FormItem><FormLabel>VAT Number</FormLabel><FormControl><Input placeholder="e.g. 0123456X" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Document defaults */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Document Defaults &amp; Policies</CardTitle>
                <CardDescription>Footer, warranty, returns and default document terms.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField control={form.control} name="document_footer" render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Document Footer Message</FormLabel><FormControl><Input placeholder="e.g. Thank you for choosing Unique Solar Kenya!" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="warranty_text" render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Warranty Text</FormLabel><FormControl><Textarea rows={2} placeholder="e.g. All solar panels carry a 12-month workmanship warranty." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="return_policy" render={({ field }) => (
              <FormItem className="md:col-span-2"><FormLabel>Return Policy</FormLabel><FormControl><Textarea rows={2} placeholder="e.g. Returns accepted within 7 days with original packaging." {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="quotation_validity_days" render={({ field }) => (
              <FormItem>
                <FormLabel>Default Quotation Validity (days)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 30"
                    value={field.value === undefined || Number.isNaN(field.value) ? '' : field.value}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="invoice_payment_terms" render={({ field }) => (
              <FormItem><FormLabel>Default Invoice Payment Terms</FormLabel><FormControl><Input placeholder="e.g. Net 30 / Cash on delivery" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving…' : 'Save Branding Settings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
