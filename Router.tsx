import React, { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import Login from '@/pages/login';
import ForgotPassword from '@/pages/forgot-password';
import Dashboard from '@/pages/dashboard';
import POS from '@/pages/pos';
import Products from '@/pages/products';
import UsersPage from '@/pages/users';
import Settings from '@/pages/settings';
import Inventory from '@/pages/inventory';
import Purchases from '@/pages/purchases';
import Customers from '@/pages/customers';
import Suppliers from '@/pages/suppliers';
import Invoices from '@/pages/invoices';
import Quotations from '@/pages/quotations';
import Expenses from '@/pages/expenses';
import Reports from '@/pages/reports';
import AuditLog from '@/pages/audit-log';
import SecurityAlerts from '@/pages/security-alerts';

function RootRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/dashboard'); }, [setLocation]);
  return null;
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground">Page not found.</p>
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />

      {/* All authenticated users */}
      <Route path="/dashboard">
        <ProtectedRoute title="Dashboard">
          <Dashboard />
        </ProtectedRoute>
      </Route>

      {/* Administrator + Sales/Cashier */}
      <Route path="/pos">
        <ProtectedRoute title="Point of Sale" allowedTiers={['administrator', 'sales_cashier']}>
          <POS />
        </ProtectedRoute>
      </Route>

      {/* Administrator + Manager + Storekeeper */}
      <Route path="/products">
        <ProtectedRoute title="Products Database" allowedTiers={['administrator', 'manager', 'storekeeper']}>
          <Products />
        </ProtectedRoute>
      </Route>
      <Route path="/inventory">
        <ProtectedRoute title="Inventory" allowedTiers={['administrator', 'manager', 'storekeeper']}>
          <Inventory />
        </ProtectedRoute>
      </Route>
      <Route path="/purchases">
        <ProtectedRoute title="Purchases" allowedTiers={['administrator', 'manager', 'storekeeper']}>
          <Purchases />
        </ProtectedRoute>
      </Route>
      <Route path="/suppliers">
        <ProtectedRoute title="Suppliers" allowedTiers={['administrator', 'manager', 'storekeeper']}>
          <Suppliers />
        </ProtectedRoute>
      </Route>

      {/* Administrator + Manager + Sales/Cashier */}
      <Route path="/customers">
        <ProtectedRoute title="Customers" allowedTiers={['administrator', 'manager', 'sales_cashier']}>
          <Customers />
        </ProtectedRoute>
      </Route>
      <Route path="/quotations">
        <ProtectedRoute title="Quotations" allowedTiers={['administrator', 'manager', 'sales_cashier']}>
          <Quotations />
        </ProtectedRoute>
      </Route>
      <Route path="/invoices">
        <ProtectedRoute title="Invoices" allowedTiers={['administrator', 'manager', 'sales_cashier']}>
          <Invoices />
        </ProtectedRoute>
      </Route>

      {/* Administrator + Manager */}
      <Route path="/reports">
        <ProtectedRoute title="Reports" allowedTiers={['administrator', 'manager']}>
          <Reports />
        </ProtectedRoute>
      </Route>

      {/* Administrator only */}
      <Route path="/expenses">
        <ProtectedRoute title="Expenses" allowedTiers={['administrator']}>
          <Expenses />
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute title="Users & Staff" allowedTiers={['administrator']}>
          <UsersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute title="Settings" allowedTiers={['administrator']}>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/audit-log">
        <ProtectedRoute title="Audit Log" allowedTiers={['administrator']}>
          <AuditLog />
        </ProtectedRoute>
      </Route>
      <Route path="/security-alerts">
        <ProtectedRoute title="Security Alerts" allowedTiers={['administrator']}>
          <SecurityAlerts />
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}
