/**
 * Colour helpers for runtime theming.
 * Converts admin-configured hex colours into the formats needed by the app
 * (Tailwind HSL triplets) and print documents (hex + darkened shades).
 */

/** Normalise a user-supplied colour to `#rrggbb`, or null when invalid. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  // Expand shorthand #rgb → #rrggbb
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Convert a hex colour into the `H S% L%` triplet Tailwind CSS variables use. */
export function hexToHslTriplet(hex: string): string | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const { r, g, b } = hexToRgb(norm);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Darken a hex colour by the given amount (0–1). Used for navy header shades. */
export function darkenHex(hex: string, amount = 0.35): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex(r * f, g * f, b * f);
}
