/**
 * Curated font choices for Company Branding. Fonts are loaded from Google Fonts
 * on demand and applied app-wide via CSS variables (see BrandingContext) and on
 * printed documents (see printDoc). Keeping the list here means the picker, the
 * runtime theme and the print utilities all agree on the same set.
 */
export interface FontOption {
  /** Stored value (the family name). */
  value: string;
  /** Human label shown in the picker. */
  label: string;
  /** Full CSS font-family stack with a safe fallback. */
  stack: string;
  /** Google Fonts family+weights specifier, or null for system fonts. */
  google: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: 'Inter', label: 'Inter (default)', stack: "'Inter', sans-serif", google: 'Inter:wght@400;500;600;700' },
  { value: 'Roboto', label: 'Roboto', stack: "'Roboto', sans-serif", google: 'Roboto:wght@400;500;700' },
  { value: 'Open Sans', label: 'Open Sans', stack: "'Open Sans', sans-serif", google: 'Open+Sans:wght@400;600;700' },
  { value: 'Lato', label: 'Lato', stack: "'Lato', sans-serif", google: 'Lato:wght@400;700' },
  { value: 'Montserrat', label: 'Montserrat', stack: "'Montserrat', sans-serif", google: 'Montserrat:wght@400;500;600;700' },
  { value: 'Poppins', label: 'Poppins', stack: "'Poppins', sans-serif", google: 'Poppins:wght@400;500;600;700' },
  { value: 'Nunito', label: 'Nunito', stack: "'Nunito', sans-serif", google: 'Nunito:wght@400;600;700' },
  { value: 'Work Sans', label: 'Work Sans', stack: "'Work Sans', sans-serif", google: 'Work+Sans:wght@400;500;600;700' },
  { value: 'Source Sans 3', label: 'Source Sans', stack: "'Source Sans 3', sans-serif", google: 'Source+Sans+3:wght@400;600;700' },
  { value: 'Merriweather', label: 'Merriweather (serif)', stack: "'Merriweather', serif", google: 'Merriweather:wght@400;700' },
  { value: 'Playfair Display', label: 'Playfair Display (serif)', stack: "'Playfair Display', serif", google: 'Playfair+Display:wght@400;600;700' },
  { value: 'Lora', label: 'Lora (serif)', stack: "'Lora', serif", google: 'Lora:wght@400;600;700' },
];

const DEFAULT_STACK = "'Inter', sans-serif";

export function fontStack(value: string | null | undefined): string {
  if (!value) return DEFAULT_STACK;
  return FONT_OPTIONS.find((f) => f.value === value)?.stack ?? DEFAULT_STACK;
}

export function googleSpec(value: string | null | undefined): string | null {
  if (!value) return null;
  return FONT_OPTIONS.find((f) => f.value === value)?.google ?? null;
}

const loaded = new Set<string>();

/** Inject a Google Fonts stylesheet for the given family once (browser only). */
export function loadFont(value: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const spec = googleSpec(value);
  if (!spec || loaded.has(spec)) return;
  loaded.add(spec);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}
