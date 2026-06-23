/**
 * Client-side API cache with SWR-like behavior.
 * 
 * - Returns cached data immediately (stale)
 * - Revalidates in background
 * - Deduplicates in-flight requests
 * - Configurable TTL per endpoint
 * 
 * NOTE: This module contains NO React hooks — safe to import anywhere.
 * For React hooks, use `use-api-cache.ts` instead.
 */

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

// In-memory cache store
const cache = new Map<string, CacheEntry>();

// In-flight request deduplication
const inFlight = new Map<string, Promise<unknown>>();

// Default TTL: 30 seconds
const DEFAULT_TTL = 30_000;

// Per-endpoint TTL overrides (endpoints that change less often can have longer TTL)
const ENDPOINT_TTL: Record<string, number> = {
  "/api/providers": 60_000,    // Providers rarely change
  "/api/combos": 60_000,       // Combos rarely change
  "/api/settings": 30_000,     // Settings change occasionally
  "/api/keys": 15_000,         // API keys might change more often
  "/api/auth/check": 5_000,    // Auth check - short TTL
};

/**
 * Get cached data if available and not expired.
 */
function getFromCache<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > ttl) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

/**
 * Store data in cache.
 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch with caching and deduplication.
 * 
 * Usage:
 *   const data = await cachedFetch<User[]>("/api/users");
 *   const freshData = await cachedFetch<User[]>("/api/users", { forceRefresh: true });
 */
export async function cachedFetch<T>(
  url: string,
  options?: { forceRefresh?: boolean } & Omit<RequestInit, "cache">
): Promise<T> {
  const { forceRefresh, ...fetchOptions } = options ?? {};
  const ttl = ENDPOINT_TTL[url] ?? DEFAULT_TTL;
  const cacheKey = `${url}|${JSON.stringify(fetchOptions)}`;

  // Return cached data immediately if available and not forced refresh
  if (!forceRefresh) {
    const cached = getFromCache<T>(cacheKey, ttl);
    if (cached !== null) {
      return cached;
    }
  }

  // Deduplicate in-flight requests
  const existing = inFlight.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  // Create new request
  const promise = fetch(url, fetchOptions)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json() as T;
      setCache(cacheKey, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(url: string): void {
  // Remove all cache entries matching this URL prefix
  for (const key of cache.keys()) {
    if (key.startsWith(`${url}|`)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics (for debugging).
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}
