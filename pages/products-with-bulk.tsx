import React from 'react';
import { useLocation } from 'wouter';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Products from './products';

export default function ProductsWithBulk() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative min-h-full">
      <Products />
      <div className="absolute top-20 right-6 sm:top-6 sm:right-44 z-30">
        <Button
          variant="secondary"
          className="shadow-sm"
          onClick={() => setLocation('/products/bulk-import')}
          data-testid="button-bulk-import-products"
        >
          <Upload className="mr-2 h-4 w-4" />
          Bulk Add Products
        </Button>
      </div>
    </div>
  );
}
