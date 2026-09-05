import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/contexts/AuthContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { ThemeProvider } from '@/components/theme-provider';
import { AppRouter } from '@/Router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="uniquepos-theme">
        <AuthProvider>
          <BranchProvider>
            <BrandingProvider>
              <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <AppRouter />
              </WouterRouter>
                <Toaster richColors position="top-right" />
              </TooltipProvider>
            </BrandingProvider>
          </BranchProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
