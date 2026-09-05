import React from 'react';
import {
  useGetSettings,
  useUpdateSettings,
  useUpdatePaymentSettings,
  getGetSettingsQueryKey,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useSearch } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { BrandingPanel, type BrandingSettingsData } from '@/components/settings/BrandingPanel';
import { SecurityPanel, type SecurityPolicyData } from '@/components/settings/SecurityPanel';
import { BranchesPanel } from '@/components/settings/BranchesPanel';
import { isSuperAdmin } from '@/lib/permissions';
import {
  Database,
  Download,
  RefreshCw,
  HardDrive,
  Clock,
  Mail,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Landmark,
  Smartphone,
  Send,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ─── Built-in rule IDs (cannot be deleted, only toggled) ─────────────────────

const BUILTIN_IDS = new Set([
  'brute-force-login',
  'bulk-product-delete',
  'user-deleted',
  'role-change',
  'settings-changed',
]);

// ─── Alert rule types (mirrors server) ───────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'action_match' | 'threshold';
  actionPattern?: string;
  thresholdAction?: string;
  thresholdCount?: number;
  windowMinutes?: number;
  severity: 'info' | 'warning' | 'critical';
  notifyInApp: boolean;
  notifyEmail: boolean;
}

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'brute-force-login',
    name: 'Repeated failed logins',
    description: 'Fires when 5 or more failed login attempts occur within 10 minutes — possible brute-force attack.',
    enabled: true,
    type: 'threshold',
    thresholdAction: 'auth.login_failed',
    thresholdCount: 5,
    windowMinutes: 10,
    severity: 'critical',
    notifyInApp: true,
    notifyEmail: true,
  },
  {
    id: 'bulk-product-delete',
    name: 'Bulk product deletions',
    description: 'Fires when 3 or more products are deleted within 5 minutes — may indicate internal misuse.',
    enabled: true,
    type: 'threshold',
    thresholdAction: 'product.deleted',
    thresholdCount: 3,
    windowMinutes: 5,
    severity: 'warning',
    notifyInApp: true,
    notifyEmail: true,
  },
  {
    id: 'user-deleted',
    name: 'User account deleted',
    description: 'Fires whenever a user account is permanently deleted.',
    enabled: true,
    type: 'action_match',
    actionPattern: 'user.deleted',
    severity: 'warning',
    notifyInApp: true,
    notifyEmail: false,
  },
  {
    id: 'role-change',
    name: 'Role or privilege change',
    description: "Fires whenever a user's role is changed — tracks privilege escalation.",
    enabled: true,
    type: 'action_match',
    actionPattern: 'user.updated',
    severity: 'info',
    notifyInApp: true,
    notifyEmail: false,
  },
  {
    id: 'settings-changed',
    name: 'Business settings changed',
    description: 'Fires whenever core business settings are modified.',
    enabled: false,
    type: 'action_match',
    actionPattern: 'settings.updated',
    severity: 'info',
    notifyInApp: true,
    notifyEmail: false,
  },
];

function mergeRules(saved: AlertRule[] | null | undefined): AlertRule[] {
  if (!saved || saved.length === 0) return DEFAULT_RULES;
  const savedById = new Map(saved.map((r) => [r.id, r]));
  const merged = DEFAULT_RULES.map((def) => {
    const s = savedById.get(def.id);
    return s ? { ...def, ...s } : def;
  });
  for (const r of saved) {
    if (!DEFAULT_RULES.find((d) => d.id === r.id)) merged.push(r);
  }
  return merged;
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'critical') return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><ShieldAlert className="h-3 w-3" />Critical</Badge>;
  if (severity === 'warning')  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><AlertTriangle className="h-3 w-3" />Warning</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1"><Info className="h-3 w-3" />Info</Badge>;
}

// ─── Create Custom Rule Dialog ────────────────────────────────────────────────

interface CreateRuleDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (rule: AlertRule) => void;
  token: string | null;
}

function CreateRuleDialog({ open, onClose, onAdd, token }: CreateRuleDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [type, setType] = React.useState<'action_match' | 'threshold'>('action_match');
  const [actionPattern, setActionPattern] = React.useState('');
  const [thresholdAction, setThresholdAction] = React.useState('');
  const [thresholdCount, setThresholdCount] = React.useState(3);
  const [windowMinutes, setWindowMinutes] = React.useState(5);
  const [severity, setSeverity] = React.useState<'info' | 'warning' | 'critical'>('warning');
  const [notifyInApp, setNotifyInApp] = React.useState(true);
  const [notifyEmail, setNotifyEmail] = React.useState(false);

  // Fetch recent audit actions for autocomplete
  const { data: recentActions = [] } = useQuery<string[]>({
    queryKey: ['audit-log-actions'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/audit-log/actions', { headers });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const reset = () => {
    setName(''); setDescription(''); setType('action_match');
    setActionPattern(''); setThresholdAction('');
    setThresholdCount(3); setWindowMinutes(5);
    setSeverity('warning'); setNotifyInApp(true); setNotifyEmail(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = type === 'action_match' ? actionPattern.trim() : thresholdAction.trim();
    if (!name.trim() || !trigger) return;
    const rule: AlertRule = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      enabled: true,
      type,
      severity,
      notifyInApp,
      notifyEmail,
      ...(type === 'action_match'
        ? { actionPattern: trigger }
        : { thresholdAction: trigger, thresholdCount, windowMinutes }),
    };
    onAdd(rule);
    reset();
    onClose();
  };

  const actionListId = 'audit-action-suggestions';
  const triggerValue = type === 'action_match' ? actionPattern : thresholdAction;
  const setTriggerValue = type === 'action_match' ? setActionPattern : setThresholdAction;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create custom alert rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-name">Rule name <span className="text-destructive">*</span></Label>
            <Input
              id="cr-name"
              placeholder="e.g. Invoice voided"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-desc">Description</Label>
            <Textarea
              id="cr-desc"
              placeholder="Optional — shown below the rule name"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label>Rule type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="action_match">Action match — fires on every matching event</SelectItem>
                <SelectItem value="threshold">Threshold — fires when count exceeds limit within a time window</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger action (with datalist autocomplete) */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-action">
              Trigger action <span className="text-destructive">*</span>
              <span className="ml-1 text-xs text-muted-foreground font-normal">— type or pick from recent actions</span>
            </Label>
            <datalist id={actionListId}>
              {recentActions.map((a) => <option key={a} value={a} />)}
            </datalist>
            <Input
              id="cr-action"
              list={actionListId}
              placeholder="e.g. invoice.voided"
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
              required
            />
          </div>

          {/* Threshold-specific fields */}
          {type === 'threshold' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cr-count">Event count</Label>
                <Input
                  id="cr-count"
                  type="number"
                  min={1}
                  value={thresholdCount}
                  onChange={(e) => setThresholdCount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cr-window">Time window (minutes)</Label>
                <Input
                  id="cr-window"
                  type="number"
                  min={1}
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Severity */}
          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notify channels */}
          <div className="space-y-2">
            <Label>Notify via</Label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Switch checked={notifyInApp} onCheckedChange={setNotifyInApp} />
                <span className="text-sm">In-app</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
                <span className="text-sm">Email</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !triggerValue.trim()}>
              Add rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SecurityAlertsData {
  security_alert_enabled?: boolean;
  alert_rules?: AlertRule[] | null;
  smtp_host?: string | null;
  business_email?: string | null;
}

function SecurityAlertsPanel({ settings }: { settings: SecurityAlertsData | undefined }) {
  const updateSettings = useUpdateSettings();
  const { token } = useAuth();
  const [masterEnabled, setMasterEnabled] = React.useState(true);
  const [rules, setRules] = React.useState<AlertRule[]>(DEFAULT_RULES);
  const [dirty, setDirty] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    if (settings) {
      setMasterEnabled(settings.security_alert_enabled !== false);
      setRules(mergeRules(settings.alert_rules));
      setDirty(false);
    }
  }, [settings]);

  const toggleMaster = (val: boolean) => {
    setMasterEnabled(val);
    setDirty(true);
  };

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
    setDirty(true);
  };

  const addRule = (rule: AlertRule) => {
    setRules((prev) => [...prev, rule]);
    setDirty(true);
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  };

  const handleSave = () => {
    updateSettings.mutate(
      { data: { security_alert_enabled: masterEnabled, alert_rules: rules } as Parameters<typeof updateSettings.mutate>[0]['data'] },
      {
        onSuccess: () => {
          toast.success('Security alert rules saved');
          setDirty(false);
        },
        onError: (err) => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  const smtpConfigured = !!settings?.smtp_host;
  const emailRecipient = settings?.business_email;

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldAlert className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Security Alert Rules</CardTitle>
              <CardDescription>
                Monitor the audit log for suspicious patterns. Matching events trigger in-app notifications and optional email alerts.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Enable security monitoring</p>
                <p className="text-xs text-muted-foreground">All rules are paused when this is off</p>
              </div>
            </div>
            <Switch checked={masterEnabled} onCheckedChange={toggleMaster} />
          </div>

          {!smtpConfigured && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Configure SMTP in the <strong>Database Backups</strong> tab to enable email alerts. In-app notifications work without SMTP.</span>
            </div>
          )}
          {smtpConfigured && emailRecipient && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Email alerts will be sent to <strong>{emailRecipient}</strong>.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Detection Rules</CardTitle>
              <CardDescription>Toggle which patterns to monitor and how to be notified.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create rule
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule) => {
            const isBuiltin = BUILTIN_IDS.has(rule.id);
            return (
              <div
                key={rule.id}
                className={`rounded-lg border p-4 space-y-3 transition-opacity ${!masterEnabled || !rule.enabled ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{rule.name}</p>
                      <SeverityBadge severity={rule.severity} />
                      {!isBuiltin && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Custom</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rule.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Trigger:{' '}
                      <span className="font-mono">
                        {rule.type === 'action_match'
                          ? rule.actionPattern
                          : `${rule.thresholdAction} × ${rule.thresholdCount} / ${rule.windowMinutes} min`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateRule(rule.id, { enabled: v })}
                      disabled={!masterEnabled}
                    />
                    {!isBuiltin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteRule(rule.id)}
                        title="Delete custom rule"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 border-t pt-3">
                  <p className="text-xs text-muted-foreground font-medium">Notify via:</p>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <Switch
                      checked={rule.notifyInApp}
                      onCheckedChange={(v) => updateRule(rule.id, { notifyInApp: v })}
                      disabled={!masterEnabled || !rule.enabled}
                      className="scale-75"
                    />
                    <span className="text-xs">In-app</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <Switch
                      checked={rule.notifyEmail}
                      onCheckedChange={(v) => updateRule(rule.id, { notifyEmail: v })}
                      disabled={!masterEnabled || !rule.enabled || !smtpConfigured}
                      className="scale-75"
                    />
                    <span className="text-xs">Email {!smtpConfigured && <span className="text-muted-foreground">(no SMTP)</span>}</span>
                  </label>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending || !dirty}>
          {updateSettings.isPending ? 'Saving…' : 'Save Alert Rules'}
        </Button>
      </div>

      <CreateRuleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onAdd={addRule}
        token={token}
      />
    </div>
  );
}

// ─── Business Settings schema ────────────────────────────────────────────────

const settingsSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  business_address: z.string().optional(),
  business_phone: z.string().optional(),
  business_email: z.string().email().optional().or(z.literal('')),
  tax_number: z.string().optional(),
  currency: z.string().min(1, 'Currency is required'),
  currency_symbol: z.string().optional(),
  vat_rate: z.coerce.number().min(0).max(100),
  receipt_footer: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

// ─── SMTP / notification schema ───────────────────────────────────────────────

const notificationSchema = z.object({
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().int().min(1).max(65535).default(587),
  smtp_user: z.string().optional(),
  smtp_from: z.string().optional(),
  smtp_password: z.string().optional(),
  backup_alert_enabled: z.boolean().default(true),
  backup_success_notify: z.boolean().default(false),
});

type NotificationFormValues = z.infer<typeof notificationSchema>;

// ─── Payment settings schema ──────────────────────────────────────────────────

const paymentSchema = z.object({
  mpesa_paybill: z.string().optional(),
  mpesa_paybill_account: z.string().optional(),
  mpesa_till: z.string().optional(),
  mpesa_buy_goods: z.string().optional(),
  bank_name: z.string().optional(),
  bank_branch: z.string().optional(),
  bank_account_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_swift_code: z.string().optional(),
  other_payment_methods: z.string().optional(),
  payment_instructions: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentSettingsData {
  mpesa_paybill?: string | null;
  mpesa_paybill_account?: string | null;
  mpesa_till?: string | null;
  mpesa_buy_goods?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_swift_code?: string | null;
  other_payment_methods?: string | null;
  payment_instructions?: string | null;
}

// ─── Backup helpers ──────────────────────────────────────────────────────────

interface BackupMeta {
  filename: string;
  size: number;
  createdAt: string;
}

interface SettingsData {
  business_email?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_from?: string | null;
  backup_alert_enabled?: boolean;
  backup_success_notify?: boolean;
}

const ADMIN_ROLES = new Set(['super_admin', 'business_owner']);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// ─── Notification Settings panel ─────────────────────────────────────────────

function NotificationSettingsPanel({ settings }: { settings: SettingsData | undefined }) {
  const updateSettings = useUpdateSettings();
  const { token } = useAuth();

  const authHeader = React.useMemo<Record<string, string>>(
    () => {
      const h: Record<string, string> = {};
      if (token) h["Authorization"] = `Bearer ${token}`;
      return h;
    },
    [token]
  );

  const sendTestEmail = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/backups/test-email', {
        method: 'POST',
        headers: authHeader,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      return body as { sentTo: string };
    },
    onSuccess: (data) => {
      toast.success(`Test email sent to ${data.sentTo}`);
    },
    onError: (err: Error) => {
      toast.error(`Failed to send test email: ${err.message}`);
    },
  });

  const form = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      smtp_from: '',
      smtp_password: '',
      backup_alert_enabled: true,
      backup_success_notify: false,
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset({
        smtp_host: settings.smtp_host ?? '',
        smtp_port: settings.smtp_port ?? 587,
        smtp_user: settings.smtp_user ?? '',
        smtp_from: settings.smtp_from ?? '',
        smtp_password: '', // never pre-filled
        backup_alert_enabled: settings.backup_alert_enabled ?? true,
        backup_success_notify: settings.backup_success_notify ?? false,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: NotificationFormValues) => {
    // Build payload — only send smtp_password via env (displayed as hint)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { smtp_password: _pw, ...rest } = data;
    updateSettings.mutate(
      { data: rest as Parameters<typeof updateSettings.mutate>[0]['data'] },
      {
        onSuccess: () => {
          toast.success('Notification settings saved');
          // If user typed a password, show the env-var instruction
          if (_pw) {
            toast.info('Set SMTP_PASSWORD as an environment secret in your server settings to apply the password.', { duration: 8000 });
          }
        },
        onError: (err) => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  const smtpConfigured = !!settings?.smtp_host;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>
              Get alerted when a backup fails or succeeds. Alerts go to the business email address.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Alert toggles */}
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Alert Preferences</p>
              <FormField
                control={form.control}
                name="backup_alert_enabled"
                render={({ field }) => (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="h-4 w-4 text-destructive" />
                      <div>
                        <Label htmlFor="alert-toggle" className="font-medium">
                          Failure alerts
                        </Label>
                        <p className="text-xs text-muted-foreground">Send an email when a backup fails</p>
                      </div>
                    </div>
                    <Switch
                      id="alert-toggle"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />
              <FormField
                control={form.control}
                name="backup_success_notify"
                render={({ field }) => (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <div>
                        <Label htmlFor="success-toggle" className="font-medium">
                          Success confirmations
                        </Label>
                        <p className="text-xs text-muted-foreground">Also notify on successful backups</p>
                      </div>
                    </div>
                    <Switch
                      id="success-toggle"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />
            </div>

            {/* SMTP config */}
            <div className="space-y-4">
              <p className="text-sm font-medium">SMTP Configuration</p>
              {!smtpConfigured && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Configure an SMTP server below to enable email delivery. Alerts go to the <strong>business email</strong> set in Business Settings.</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="smtp_host"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>SMTP Host</FormLabel>
                      <FormControl>
                        <Input placeholder="smtp.example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtp_port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Port</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="587" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="smtp_user"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Username</FormLabel>
                      <FormControl>
                        <Input placeholder="alerts@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="smtp_from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Address</FormLabel>
                      <FormControl>
                        <Input placeholder='UniquePOS &lt;alerts@example.com&gt;' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="rounded-lg bg-muted/50 border p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  The SMTP password is stored as the <code className="font-mono bg-muted px-1 rounded">SMTP_PASSWORD</code> environment secret on the server — not in the database. Set it in your deployment's environment variables.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!smtpConfigured || sendTestEmail.isPending}
                onClick={() => sendTestEmail.mutate()}
                title={!smtpConfigured ? 'Configure SMTP first' : 'Send a test email to verify your settings'}
              >
                <Send className={`h-4 w-4 ${sendTestEmail.isPending ? 'animate-pulse' : ''}`} />
                {sendTestEmail.isPending ? 'Sending…' : 'Send test email'}
              </Button>
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? 'Saving…' : 'Save Notification Settings'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ─── Backup panel ────────────────────────────────────────────────────────────

function BackupsPanel({ settings }: { settings: SettingsData | undefined }) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const authHeader = React.useMemo<Record<string, string>>(
    () => {
      const h: Record<string, string> = {};
      if (token) h["Authorization"] = `Bearer ${token}`;
      return h;
    },
    [token]
  );

  const { data, isLoading, error } = useQuery<{ backups: BackupMeta[] }>({
    queryKey: ['admin', 'backups'],
    queryFn: async () => {
      const res = await fetch('/api/admin/backups', { headers: authHeader });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      return res.json();
    },
    staleTime: 30_000,
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/backups/run', {
        method: 'POST',
        headers: authHeader,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      return res.json();
    },
    onSuccess: () => {
      toast.success('Backup completed successfully');
      qc.invalidateQueries({ queryKey: ['admin', 'backups'] });
    },
    onError: (err: Error) => {
      toast.error(`Backup failed: ${err.message}`);
    },
  });

  const [restoreTarget, setRestoreTarget] = React.useState<string | null>(null);
  const [confirmText, setConfirmText] = React.useState('');

  const restore = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      return body;
    },
    onSuccess: () => {
      toast.success('Database restored successfully. Please refresh the page.');
      setRestoreTarget(null);
      setConfirmText('');
      qc.invalidateQueries();
    },
    onError: (err: Error) => toast.error(`Restore failed: ${err.message}`),
  });

  const handleDownload = (filename: string) => {
    const a = document.createElement('a');
    a.href = `/api/admin/backups/${encodeURIComponent(filename)}/download`;
    fetch(a.href, { headers: authHeader })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => toast.error(err.message));
  };

  const backups = data?.backups ?? [];
  const smtpConfigured = !!settings?.smtp_host;
  const alertEnabled = settings?.backup_alert_enabled ?? true;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Database Backups</CardTitle>
                <CardDescription>
                  Automatic daily backup at 02:00 EAT — last 14 days retained
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Notification status badge */}
              {smtpConfigured && alertEnabled ? (
                <Badge variant="secondary" className="gap-1.5 text-green-700 bg-green-100 border-green-200">
                  <Bell className="h-3 w-3" />
                  Alerts on
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                  <BellOff className="h-3 w-3" />
                  No alerts
                </Badge>
              )}
              <Button
                onClick={() => runNow.mutate()}
                disabled={runNow.isPending}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${runNow.isPending ? 'animate-spin' : ''}`} />
                {runNow.isPending ? 'Backing up…' : 'Backup Now'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Backup list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Stored Backups
            {backups.length > 0 && (
              <Badge variant="secondary">{backups.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load backups. {(error as Error).message}
            </p>
          ) : backups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No backups yet</p>
              <p className="text-xs mt-1">
                Click "Backup Now" to create the first backup, or wait for the
                scheduled job at 02:00 EAT.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-mono truncate">{b.filename}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(b.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(b.size)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => handleDownload(b.filename)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-amber-700 hover:text-amber-800 border-amber-200 hover:bg-amber-50"
                      onClick={() => { setRestoreTarget(b.filename); setConfirmText(''); }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email notifications */}
      <NotificationSettingsPanel settings={settings} />

      <p className="text-xs text-muted-foreground text-center">
        Backups are compressed SQL dumps (.sql.gz). Use <strong>Restore</strong> to roll the database
        back to a saved backup, or <strong>Download</strong> to keep an offline copy.
      </p>

      {/* Restore confirmation — destructive, type-to-confirm */}
      <Dialog open={!!restoreTarget} onOpenChange={(v) => { if (!v) { setRestoreTarget(null); setConfirmText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Restore database
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-1">
              <p className="font-medium">This will replace ALL current data.</p>
              <p>
                Every record created since this backup will be permanently lost and the app may be
                briefly unavailable while the restore runs. This cannot be undone.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Restoring from: <span className="font-mono text-foreground break-all">{restoreTarget}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="restore-confirm">Type <span className="font-mono font-semibold">RESTORE</span> to confirm</Label>
              <Input
                id="restore-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreTarget(null); setConfirmText(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== 'RESTORE' || restore.isPending}
              onClick={() => restoreTarget && restore.mutate(restoreTarget)}
            >
              {restore.isPending ? 'Restoring…' : 'Restore database'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Payment Settings panel (super administrators only) ───────────────────────

function PaymentSettingsPanel({ settings }: { settings: PaymentSettingsData | undefined }) {
  const updatePayment = useUpdatePaymentSettings();
  const queryClient = useQueryClient();

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      mpesa_paybill: '',
      mpesa_paybill_account: '',
      mpesa_till: '',
      mpesa_buy_goods: '',
      bank_name: '',
      bank_branch: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_swift_code: '',
      other_payment_methods: '',
      payment_instructions: '',
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset({
        mpesa_paybill: settings.mpesa_paybill ?? '',
        mpesa_paybill_account: settings.mpesa_paybill_account ?? '',
        mpesa_till: settings.mpesa_till ?? '',
        mpesa_buy_goods: settings.mpesa_buy_goods ?? '',
        bank_name: settings.bank_name ?? '',
        bank_branch: settings.bank_branch ?? '',
        bank_account_name: settings.bank_account_name ?? '',
        bank_account_number: settings.bank_account_number ?? '',
        bank_swift_code: settings.bank_swift_code ?? '',
        other_payment_methods: settings.other_payment_methods ?? '',
        payment_instructions: settings.payment_instructions ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: PaymentFormValues) => {
    updatePayment.mutate(
      { data },
      {
        onSuccess: () => {
          toast.success('Payment settings saved');
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
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
            These payment details are pulled automatically into every quotation, invoice, receipt
            and PDF export. Only super administrators can edit them.
          </p>
        </div>

        {/* M-Pesa */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>M-Pesa</CardTitle>
                <CardDescription>Paybill, Till and Buy Goods numbers.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {([
              ['mpesa_paybill', 'Paybill Number', 'e.g. 400200'],
              ['mpesa_paybill_account', 'Paybill Account Number', 'e.g. UNIQUE'],
              ['mpesa_till', 'Till Number', 'e.g. 123456'],
              ['mpesa_buy_goods', 'Buy Goods Number', 'e.g. 654321'],
            ] as const).map(([name, label, ph]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input placeholder={ph} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        {/* Bank */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Landmark className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Bank Transfer</CardTitle>
                <CardDescription>Bank account details for direct transfers.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {([
              ['bank_name', 'Bank Name', 'e.g. Equity Bank'],
              ['bank_branch', 'Branch', 'e.g. Ruiru'],
              ['bank_account_name', 'Account Name', 'e.g. Unique Solar Kenya Ltd'],
              ['bank_account_number', 'Account Number', 'e.g. 0123456789'],
              ['bank_swift_code', 'SWIFT Code', 'e.g. EQBLKENA'],
            ] as const).map(([name, label, ph]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input placeholder={ph} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        {/* Other */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Other Payment Methods</CardTitle>
                <CardDescription>Any additional instructions shown on documents.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="other_payment_methods"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Other Payment Methods</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Cheques payable to Unique Solar Kenya Ltd" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="e.g. Please quote your invoice number as the payment reference. Payments are due within 14 days."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={updatePayment.isPending || !form.formState.isDirty}>
            {updatePayment.isPending ? 'Saving…' : 'Save Payment Settings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── Main Settings page ──────────────────────────────────────────────────────

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const isAdmin = user && ADMIN_ROLES.has(user.role);
  const isSuper = isSuperAdmin(user?.role);

  // Support deep-link: /settings?tab=backups (or any valid tab value)
  const tabFromUrl = React.useMemo(() => {
    const params = new URLSearchParams(searchString);
    const tab = params.get('tab');
    const valid = ['business', 'security', 'branches', 'branding', 'payment', 'backups', 'alerts'];
    return tab && valid.includes(tab) ? tab : 'business';
  }, [searchString]);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      business_name: '',
      business_address: '',
      business_phone: '',
      business_email: '',
      tax_number: '',
      currency: 'KES',
      currency_symbol: 'KES',
      vat_rate: 16,
      receipt_footer: 'Thank you for your business!',
      country: 'Kenya',
      timezone: 'Africa/Nairobi',
    },
  });

  React.useEffect(() => {
    if (settings) {
      form.reset({
        business_name: settings.business_name,
        business_address: settings.business_address || '',
        business_phone: settings.business_phone || '',
        business_email: settings.business_email || '',
        tax_number: settings.tax_number || '',
        currency: settings.currency || 'KES',
        currency_symbol: settings.currency_symbol || 'KES',
        vat_rate: settings.vat_rate || 16,
        receipt_footer: settings.receipt_footer || 'Thank you for your business!',
        country: settings.country || 'Kenya',
        timezone: settings.timezone || 'Africa/Nairobi',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate(
      { data },
      { onSuccess: () => toast.success('Settings saved successfully') }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-primary">System Settings</h2>
        <p className="text-muted-foreground">Manage your business profile and preferences</p>
      </div>

      <Tabs value={tabFromUrl} onValueChange={(tab) => setLocation(`/settings?tab=${tab}`)}>
        <TabsList className={isAdmin ? 'grid w-full grid-cols-7' : 'grid w-full grid-cols-2'}>
          <TabsTrigger value="business">Business Settings</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isSuper && <TabsTrigger value="branches">Branches</TabsTrigger>}
          {isAdmin && <TabsTrigger value="branding">Company Branding</TabsTrigger>}
          {isAdmin && <TabsTrigger value="payment">Payment Details</TabsTrigger>}
          {isAdmin && <TabsTrigger value="backups">Database Backups</TabsTrigger>}
          {isAdmin && <TabsTrigger value="alerts">Security Alerts</TabsTrigger>}
        </TabsList>

        {/* ── Business Settings ── */}
        <TabsContent value="business" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Business Information</CardTitle>
                  <CardDescription>
                    This information will appear on your receipts and invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="business_name"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Business Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="business_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl><Input type="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="business_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="business_address"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Physical Address</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tax_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax / KRA PIN Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="receipt_footer"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Receipt Footer Message</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Financial Settings</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency Code</FormLabel>
                        <FormControl><Input {...field} disabled /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="currency_symbol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency Symbol</FormLabel>
                        <FormControl><Input {...field} disabled /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="vat_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default VAT Rate (%)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? 'Saving…' : 'Save All Settings'}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        {/* ── Security (change password, 2FA, policy, login history) ── */}
        <TabsContent value="security" className="mt-6">
          <SecurityPanel policy={settings as SecurityPolicyData | undefined} isAdmin={!!isAdmin} />
        </TabsContent>

        {/* ── Branches ── */}
        {isSuper && (
          <TabsContent value="branches" className="mt-6">
            <BranchesPanel />
          </TabsContent>
        )}

        {/* ── Company Branding ── */}
        {isAdmin && (
          <TabsContent value="branding" className="mt-6">
            <BrandingPanel settings={settings as BrandingSettingsData | undefined} />
          </TabsContent>
        )}

        {/* ── Payment Details ── */}
        {isAdmin && (
          <TabsContent value="payment" className="mt-6">
            <PaymentSettingsPanel settings={settings as PaymentSettingsData | undefined} />
          </TabsContent>
        )}

        {/* ── Database Backups ── */}
        {isAdmin && (
          <TabsContent value="backups" className="mt-6">
            <BackupsPanel settings={settings as SettingsData | undefined} />
          </TabsContent>
        )}

        {/* ── Security Alerts ── */}
        {isAdmin && (
          <TabsContent value="alerts" className="mt-6">
            <SecurityAlertsPanel settings={settings as SecurityAlertsData | undefined} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
