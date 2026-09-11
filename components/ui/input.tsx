import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, value, onChange, readOnly, ...rest }, ref) => {
    const isAutoProductCode = rest.name === 'product_code' && (value === '' || value == null);

    React.useEffect(() => {
      if (!isAutoProductCode || typeof onChange !== 'function') return;
      onChange({
        target: { name: 'product_code', value: 'AUTO' },
      } as React.ChangeEvent<HTMLInputElement>);
    }, [isAutoProductCode, onChange]);

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        readOnly={isAutoProductCode || readOnly}
        value={isAutoProductCode ? 'AUTO' : value}
        onChange={onChange}
        {...rest}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
