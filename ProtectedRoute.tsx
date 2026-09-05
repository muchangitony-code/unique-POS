import React from 'react';
import { Redirect, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { getTier, type FunctionalTier } from '@/lib/permissions';
import { Sidebar } from './layout/Sidebar';
import { TopNav } from './layout/TopNav';
import AccessDenied from '@/pages/access-denied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  title?: string;
  /** If provided, only users whose tier is in this list may view the page. */
  allowedTiers?: FunctionalTier[];
}

export function ProtectedRoute({ children, title, allowedTiers }: ProtectedRouteProps) {
  const { token, user } = useAuth();
  const [location] = useLocation();

  if (!token) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  const tier = getTier(user?.role);
  const denied = allowedTiers && (!tier || !allowedTiers.includes(tier));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        <TopNav title={denied ? 'Access Denied' : title} />
        <main className="flex-1 overflow-auto bg-muted/20">
          {denied ? <AccessDenied /> : children}
        </main>
      </div>
    </div>
  );
}
