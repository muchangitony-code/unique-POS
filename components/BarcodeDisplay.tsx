import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeDisplayProps {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}

export function BarcodeDisplay({
  value,
  width = 2,
  height = 60,
  fontSize = 12,
  displayValue = true,
  className = '',
}: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        fontSize,
        displayValue,
        margin: 4,
        background: 'transparent',
      });
    } catch {
      // invalid barcode value — leave blank
    }
  }, [value, width, height, fontSize, displayValue]);

  if (!value) return null;

  return <svg ref={svgRef} className={className} />;
}
