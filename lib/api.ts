/** Returns the API base URL with a trailing slash, e.g. "/api/" */
export function getApiUrl(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
  return base.replace(/\/+$/, '') + '/';
}
