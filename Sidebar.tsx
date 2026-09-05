import React from 'react';
import { Link, useLocation } from 'wouter';
import { useBranding } from '@/contexts/BrandingContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  ShoppingBag,
  Users,
  Truck,
  FileText,
  Receipt,
  CreditCard,
  BarChart3,
  UserCog,
  Settings,
  LogOut,
  ScrollText,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getTier, type FunctionalTier } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  tiers: FunctionalTier[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard, tiers: ['administrator', 'manager', 'sales_cashier', 'storekeeper'] },
  { href: '/pos',        label: 'POS',         icon: ShoppingCart,    tiers: ['administrator', 'sales_cashier'] },
  { href: '/products',   label: 'Products',    icon: Package,         tiers: ['administrator', 'manager', 'storekeeper'] },
  { href: '/inventory',  label: 'Inventory',   icon: Warehouse,       tiers: ['administrator', 'manager', 'storekeeper'] },
  { href: '/purchases',  label: 'Purchases',   icon: ShoppingBag,     tiers: ['administrator', 'manager', 'storekeeper'] },
  { href: '/customers',  label: 'Customers',   icon: Users,           tiers: ['administrator', 'manager', 'sales_cashier'] },
  { href: '/suppliers',  label: 'Suppliers',   icon: Truck,           tiers: ['administrator', 'manager', 'storekeeper'] },
  { href: '/quotations', label: 'Quotations',  icon: FileText,        tiers: ['administrator', 'manager', 'sales_cashier'] },
  { href: '/invoices',   label: 'Invoices',    icon: Receipt,         tiers: ['administrator', 'manager', 'sales_cashier'] },
  { href: '/expenses',   label: 'Expenses',    icon: CreditCard,      tiers: ['administrator'] },
  { href: '/reports',    label: 'Reports',     icon: BarChart3,       tiers: ['administrator', 'manager'] },
  { href: '/audit-log',        label: 'Audit Log',      icon: ScrollText,  tiers: ['administrator'] },
  { href: '/security-alerts', label: 'Security Alerts', icon: ShieldAlert, tiers: ['administrator'] },
  { href: '/users',           label: 'Users',           icon: UserCog,     tiers: ['administrator'] },
  { href: '/settings',   label: 'Settings',    icon: Settings,        tiers: ['administrator'] },
];

const TIER_LABEL: Record<FunctionalTier, string> = {
  administrator: 'Administrator',
  manager:       'Manager',
  sales_cashier: 'Sales / Cashier',
  storekeeper:   'Storekeeper',
};

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const tier = getTier(user?.role);
  const visibleItems = NAV_ITEMS.filter((item) => !!tier && item.tiers.includes(tier));

  return (
    <div className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo / brand header */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className="w-9 h-9 object-contain rounded-lg flex-shrink-0"
          style={{ background: 'white', padding: '2px' }}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-white truncate">{branding.name}</p>
          <p className="text-[10px] leading-tight truncate" style={{ color: 'hsl(var(--sidebar-primary))' }}>
            {branding.tagline}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-0.5 px-2">
          {visibleItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} data-testid={`nav-${item.label.toLowerCase()}`}>
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary font-semibold'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <item.icon
                    className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/50')}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="p-4">
        <Separator className="mb-4 bg-sidebar-border" />
        <div className="flex items-center gap-2 mb-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
            style={{ background: 'hsl(37,91%,52%)', color: 'hsl(216,68%,14%)' }}
          >
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex flex-col truncate min-w-0">
            <span className="text-sm font-medium truncate text-sidebar-foreground">{user?.name}</span>
            <span className="text-[10px] text-sidebar-foreground/50 truncate">
              {tier ? TIER_LABEL[tier] : (user?.role ?? '')}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
          onClick={logout}
          data-testid="button-logout"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}
