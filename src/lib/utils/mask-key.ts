/**
 * Mask an API key for display — shows first 4 + last 4 chars, hides middle.
 * Returns "Not set" for null/undefined, "****" for short keys.
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "Not set";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
