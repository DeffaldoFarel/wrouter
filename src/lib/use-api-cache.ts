/**
 * React hooks for client-side API caching.
 * 
 * These hooks use the cache from `api-cache.ts` but add React state management.
 * Must be used in Client Components only (marked with "use client").
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cachedFetch, invalidateCache, clearCache, getCacheStats } from "./api-cache";

// Re-export cache functions for convenience
export { cachedFetch, invalidateCache, clearCache, getCacheStats };

const ENDPOINT_TTL: Record<string, number> = {
  "/api/providers": 60_000,
  "/api/combos": 60_000,
  "/api/settings": 30_000,
  "/api/keys": 15_000,
  "/api/auth/check": 5_000,
};
const DEFAULT_TTL = 30_000;

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  revalidate: () => Promise<void>;
}

/**
 * Hook for cached fetch with SWR-like behavior.
 * Returns cached data immediately, then revalidates in background.
 * 
 * Usage:
 *   const { data, loading } = useCachedFetch<User[]>("/api/users");
 */
export function useCachedFetch<T>(
  url: string | null,  // null = don't fetch
  options?: { ttl?: number; enabled?: boolean }
): UseCachedFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const ttl = options?.ttl ?? ENDPOINT_TTL[url ?? ""] ?? DEFAULT_TTL;
  const enabled = options?.enabled ?? url !== null;
  
  // Track mounted state to prevent setState after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled || !url) return;

    // Check cache first - return immediately if valid
    const cached = await cachedFetch<T>(url, { forceRefresh });
    
    if (mountedRef.current) {
      setData(cached);
      setLoading(false);
      setError(null);
    }
  }, [url, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const revalidate = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, loading: loading && data === null, error, revalidate };
}

/**
 * Hook for multiple parallel cached fetches.
 * Returns combined loading state and individual data.
 * 
 * Usage:
 *   const { results, loading, error } = useParallelCachedFetch({
 *     providers: "/api/providers",
 *     keys: "/api/keys",
 *     combos: "/api/combos",
 *   });
 *   // results.providers, results.keys, results.combos
 */
export function useParallelCachedFetch<T extends Record<string, string | null>>(
  urls: T,
  options?: { ttl?: number }
): {
  results: { [K in keyof T]: T[K] extends string ? unknown : null };
  loading: boolean;
  errors: Partial<Record<keyof T, Error>>;
  revalidate: (key?: keyof T) => Promise<void>;
} {
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Partial<Record<string, Error>>>({});

  const ttl = options?.ttl;

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      const entries = Object.entries(urls).filter(([, url]) => url !== null);
      
      // Initialize loading states
      const initialLoading: Record<string, boolean> = {};
      for (const [key] of entries) {
        initialLoading[key] = true;
      }
      if (!cancelled) {
        setLoadingStates(initialLoading);
      }

      // Fetch all in parallel with caching
      const promises = entries.map(async ([key, url]) => {
        try {
          const data = await cachedFetch(url!);
          if (!cancelled) {
            setResults(prev => ({ ...prev, [key]: data }));
            setLoadingStates(prev => ({ ...prev, [key]: false }));
            setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
          }
        } catch (err) {
          if (!cancelled) {
            setErrors(prev => ({ ...prev, [key]: err instanceof Error ? err : new Error(String(err)) }));
            setLoadingStates(prev => ({ ...prev, [key]: false }));
          }
        }
      });

      await Promise.all(promises);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [JSON.stringify(urls), ttl]);

  const revalidate = useCallback(async (key?: keyof T) => {
    if (key) {
      const url = urls[key as string];
      if (url) {
        invalidateCache(url);
        const data = await cachedFetch(url, { forceRefresh: true });
        setResults(prev => ({ ...prev, [key as string]: data }));
      }
    } else {
      // Revalidate all
      for (const [, url] of Object.entries(urls)) {
        if (url) {
          invalidateCache(url);
        }
      }
      // Trigger re-fetch by clearing results
      setResults({});
      setLoadingStates({});
    }
  }, [urls]);

  const anyLoading = Object.values(loadingStates).some(Boolean);

  return {
    results: results as { [K in keyof T]: T[K] extends string ? unknown : null },
    loading: anyLoading && Object.keys(results).length === 0,
    errors: errors as Partial<Record<keyof T, Error>>,
    revalidate,
  };
}
