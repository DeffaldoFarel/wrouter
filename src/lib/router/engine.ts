import { db } from "../db";
import { providers, combos, requestLogs, apiKeys } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { calculateSimpleCost } from "../cost-calculator";
import logger from "@/lib/logger";
import { pickConnection, pickFallback, recordError } from "../key-picker";

// In-memory counter of active (in-flight) proxy jobs.
// LIMITATION: This is per-process only. If the app runs in cluster/multi-process mode
// (e.g., with PM2 cluster or multiple Node.js workers), each process has its own counter.
// The displayed count will only reflect the process handling the current request.
// For single-process deployments (default), this works correctly.
let _activeJobs = 0;

export function incrementActiveJobs() { _activeJobs++; }
export function decrementActiveJobs() { if (_activeJobs > 0) _activeJobs--; }
export function getActiveJobs() { return _activeJobs; }

// Simple in-memory cache for providers (rarely change)
const providerCache = {
  data: null as typeof providers.$inferSelect[] | null,
  timestamp: 0,
  ttl: 5 * 60 * 1000, // 5 minutes
};

/**
 * Get all providers with caching (5 min TTL).
 * Reduces DB queries for frequently accessed provider data.
 */
function getAllProvidersCached(): typeof providers.$inferSelect[] {
  const now = Date.now();
  if (!providerCache.data || now - providerCache.timestamp > providerCache.ttl) {
    providerCache.data = db.select().from(providers).all();
    providerCache.timestamp = now;
  }
  return providerCache.data;
}

/**
 * Invalidate provider cache (call after provider changes).
 */
export function invalidateProviderCache() {
  providerCache.data = null;
  providerCache.timestamp = 0;
}

/**
 * Safely parse JSON with fallback to default value.
 * Prevents app crash if database contains invalid JSON.
 */
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// Lazy import to avoid circular deps at module load time
function notifySSE(event: Record<string, unknown>) {
  try {
    // Dynamic require so this doesn't break if the route isn't loaded yet
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { notifySubscribers } = require("../../app/api/events/route");
    notifySubscribers(event);
  } catch {
    // SSE route not loaded yet or not available — silently ignore
  }
}

/**
 * Notify SSE subscribers that a request is starting on a specific provider.
 * This allows the UI to show real-time "active" indicators.
 */
export function notifyRequestStart(providerId: string, providerName: string, model: string) {
  notifySSE({ type: "request-start", providerId, providerName, model });
}

export interface ComboModel {
  model: string;
  providerId: string;
  priority: number;
}

export interface RoutingResult {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  // Upstream API dialect: "openai" (default) | "anthropic" | "gemini"
  // Determines how proxy.ts translates the request/response.
  format: string;
  // Multi-key support: which connection was used (null if fallback to provider-level key)
  connectionId: string | null;
}

/**
 * Resolve a model request to a specific provider.
 * 
 * Model format:
 * - "combo-slug" → use combo's first available model by priority
 * - "combo-slug/model-name" → use specific model from combo with fallback
 * - "prefix/model-name" → route directly to provider with that prefix
 * - "model-name" → find first provider that has this model
 */

/**
 * Try to resolve an API key from multi-key connections for a provider.
 * Falls back to the provider-level apiKey if no connections exist.
 */
function resolveProviderKey(
  provider: typeof providers.$inferSelect,
): { apiKey: string; connectionId: string | null } | null {
  // Try multi-key connections first
  const strategy = (provider as { connectionStrategy?: string }).connectionStrategy ?? "priority";
  const picked = pickConnection(provider.id, strategy);

  if (picked.key) {
    return { apiKey: picked.key.apiKey, connectionId: picked.connectionId };
  }

  // Fallback to provider-level single key (backward compatibility)
  if (provider.apiKey) {
    return { apiKey: provider.apiKey, connectionId: null };
  }

  return null;
}

/**
 * Build a RoutingResult from a provider row.
 * Returns null if no API key is available.
 */
function buildRoutingResult(
  provider: typeof providers.$inferSelect,
  modelName: string,
): RoutingResult | null {
  const keyInfo = resolveProviderKey(provider);
  if (!keyInfo) return null;

  return {
    providerId: provider.id,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: keyInfo.apiKey,
    format: (provider as { format?: string }).format ?? "openai",
    model: modelName,
    connectionId: keyInfo.connectionId,
  };
}

/**
 * I4: Build multiple RoutingResults — one per available key for a provider.
 * Used by getFallbackChain to expand a single provider into N entries (one per key)
 * so the existing for-loop in proxy.ts naturally rotates keys before falling back
 * to the next provider.
 *
 * Returns at least 1 result if the provider has any usable key.
 * Iterates pickConnection with excludeConnectionIds to enumerate all available keys.
 */
function buildAllRoutingResults(
  provider: typeof providers.$inferSelect,
  modelName: string,
  maxKeysPerProvider = 3,
): RoutingResult[] {
  const results: RoutingResult[] = [];
  const tried: string[] = [];
  const strategy = (provider as { connectionStrategy?: string }).connectionStrategy ?? "priority";

  // Try to get up to maxKeysPerProvider distinct connections
  for (let i = 0; i < maxKeysPerProvider; i++) {
    const picked = pickConnection(provider.id, strategy, tried);
    if (!picked.key || !picked.connectionId) break;

    results.push({
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: picked.key.apiKey,
      format: (provider as { format?: string }).format ?? "openai",
      model: modelName,
      connectionId: picked.connectionId,
    });
    tried.push(picked.connectionId);
  }

  // Fallback to provider-level single key (backward compatibility) if no multi-keys
  if (results.length === 0 && provider.apiKey) {
    results.push({
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      format: (provider as { format?: string }).format ?? "openai",
      model: modelName,
      connectionId: null,
    });
  }

  return results;
}

export function resolveModel(requestedModel: string): RoutingResult | null {
  logger.debug({ model: requestedModel }, "Resolving model");

  // Check if it's a prefixed request (contains slash)
  if (requestedModel.includes("/")) {
    // Only split on the FIRST slash — model names can contain slashes (e.g. openrouter/deepseek/deepseek-chat-v3)
    const slashIdx  = requestedModel.indexOf("/");
    const slug      = requestedModel.slice(0, slashIdx);
    const modelName = requestedModel.slice(slashIdx + 1); // preserve remaining slashes in model name

    // First check if it's a provider prefix
    const providerByPrefix = db.select().from(providers)
      .where(eq(providers.prefix, slug))
      .get();

    if (providerByPrefix && providerByPrefix.enabled) {
      // Strict model validation: model must be in provider's registered list
      const registeredModels: string[] = safeJsonParse<string[]>(providerByPrefix.models, []);
      if (!registeredModels.includes(modelName)) {
        return null; // Model not registered — reject before hitting upstream
      }
      return buildRoutingResult(providerByPrefix, modelName);
    }

    // Then check if it's a combo slug
    return resolveComboModel(slug, modelName);
  }

  // Check if the requested model matches a combo slug exactly
  const combo = db.select().from(combos)
    .where(eq(combos.slug, requestedModel))
    .get();

  if (combo && combo.enabled) {
    return resolveComboFirstModel(combo);
  }

  // Direct model lookup — find first enabled provider with this model
  return resolveDirectModel(requestedModel);
}

/**
 * Resolve a model from a combo with fallback chain.
 */
function resolveComboModel(slug: string, modelName: string): RoutingResult | null {
  const combo = db.select().from(combos)
    .where(eq(combos.slug, slug))
    .get();

  if (!combo || !combo.enabled) return null;

  const comboModels: ComboModel[] = safeJsonParse<ComboModel[]>(combo.models, []);

  // Filter models that match the requested model name, sorted by priority
  const matchingModels = comboModels
    .filter((m) => m.model === modelName)
    .sort((a, b) => a.priority - b.priority);

  if (matchingModels.length === 0) return null;

  // Batch fetch all providers in one query (fixes N+1 problem)
  const providerIds = Array.from(new Set(matchingModels.map(m => m.providerId)));
  const allProviders = db.select().from(providers)
    .where(inArray(providers.id, providerIds))
    .all();
  const providerMap = new Map(allProviders.map(p => [p.id, p]));

  // Try each model in priority order
  for (const entry of matchingModels) {
    const provider = providerMap.get(entry.providerId);

    if (provider && provider.enabled) {
      return buildRoutingResult(provider, entry.model);
    }
  }

  return null;
}

/**
 * Use the first model in a combo (by priority) when no specific model is specified.
 */
function resolveComboFirstModel(combo: typeof combos.$inferSelect): RoutingResult | null {
  const comboModels: ComboModel[] = safeJsonParse<ComboModel[]>(combo.models, []);
  const sorted = comboModels.sort((a, b) => a.priority - b.priority);

  if (sorted.length === 0) return null;

  // Batch fetch all providers in one query (fixes N+1 problem)
  const providerIds = Array.from(new Set(sorted.map(m => m.providerId)));
  const allProviders = db.select().from(providers)
    .where(inArray(providers.id, providerIds))
    .all();
  const providerMap = new Map(allProviders.map(p => [p.id, p]));

  for (const entry of sorted) {
    const provider = providerMap.get(entry.providerId);

    if (provider && provider.enabled) {
      return buildRoutingResult(provider, entry.model);
    }
  }

  return null;
}

/**
 * Find first enabled provider that has the requested model.
 */
function resolveDirectModel(modelName: string): RoutingResult | null {
  const allProviders = getAllProvidersCached();

  for (const provider of allProviders) {
    if (!provider.enabled) continue;

    const providerModels: string[] = safeJsonParse<string[]>(provider.models, []);
    if (providerModels.includes(modelName)) {
      return buildRoutingResult(provider, modelName);
    }
  }

  return null;
}

/**
 * Get fallback chain for a combo + model.
 * Returns all matching providers in priority order.
 */
export function getFallbackChain(requestedModel: string): RoutingResult[] {
  const results: RoutingResult[] = [];

  if (requestedModel.includes("/")) {
    const slashIdx  = requestedModel.indexOf("/");
    const slug      = requestedModel.slice(0, slashIdx);
    const modelName = requestedModel.slice(slashIdx + 1); // preserve slashes in model name

    // First check if it's a provider prefix (no fallback, single result)
    const providerByPrefix = db.select().from(providers)
      .where(eq(providers.prefix, slug))
      .get();

    if (providerByPrefix && providerByPrefix.enabled) {
      // Strict model validation — same as resolveModel()
      const registeredModels: string[] = safeJsonParse<string[]>(providerByPrefix.models, []);
      if (registeredModels.includes(modelName)) {
        // I4: Expand into multiple entries (one per key) for failover
        results.push(...buildAllRoutingResults(providerByPrefix, modelName));
      }
      return results; // return even if empty — prefix matched, don't fall through to combo
    }

    // Then check combo
    const combo = db.select().from(combos)
      .where(eq(combos.slug, slug))
      .get();

    if (!combo || !combo.enabled) return results;

    const comboModels: ComboModel[] = safeJsonParse<ComboModel[]>(combo.models, []);
    const sorted = comboModels.sort((a, b) => a.priority - b.priority);

    if (sorted.length === 0) return results;

    // Batch fetch all providers in one query (fixes N+1 problem)
    const providerIds = Array.from(new Set(sorted.map(m => m.providerId)));
    const allProviders = db.select().from(providers)
      .where(inArray(providers.id, providerIds))
      .all();
    const providerMap = new Map(allProviders.map(p => [p.id, p]));

    for (const entry of sorted) {
      const provider = providerMap.get(entry.providerId);

      if (provider && provider.enabled) {
        // I4: Expand into multiple entries (one per key) for failover
        results.push(...buildAllRoutingResults(provider, entry.model));
      }
    }
  } else {
    // Check if it's a combo slug first
    const combo = db.select().from(combos)
      .where(eq(combos.slug, requestedModel))
      .get();

    if (combo && combo.enabled) {
      // Build fallback chain from combo models
      const comboModels: ComboModel[] = safeJsonParse<ComboModel[]>(combo.models, []);
      const sorted = comboModels.sort((a, b) => a.priority - b.priority);

      // Batch fetch all providers in one query (fixes N+1 problem)
      const providerIds = Array.from(new Set(sorted.map(m => m.providerId)));
      const allProviders = db.select().from(providers)
        .where(inArray(providers.id, providerIds))
        .all();
      const providerMap = new Map(allProviders.map(p => [p.id, p]));

      for (const entry of sorted) {
        const provider = providerMap.get(entry.providerId);

        if (provider && provider.enabled) {
          // I4: Expand into multiple entries (one per key) for failover
          results.push(...buildAllRoutingResults(provider, entry.model));
        }
      }
    } else {
      // For direct model, just return the single match
      const result = resolveDirectModel(requestedModel);
      if (result) results.push(result);
    }
  }

  return results;
}

/**
 * Log a request result.
 */
export function logRequest(params: {
  model: string;
  providerId: string | null;
  comboId?: string | null;
  apiKeyId?: string | null;
  connectionId?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  status: "success" | "error" | "fallback";
  isStreaming?: boolean;
  error?: string;
  requestDetail?: string | null;
  responseDetail?: string | null;
  providerCost?: number | null;
}) {
  // Use provider-reported cost if available, otherwise estimate
  let costUsd: string | null = null;
  if (params.providerCost != null && params.providerCost > 0) {
    // Provider gave us actual cost — use it (more accurate)
    costUsd = params.providerCost.toFixed(6);
  } else if (params.tokensIn && params.tokensOut && params.model) {
    // Fallback: estimate from internal pricing table
    const cost = calculateSimpleCost(params.model, params.tokensIn, params.tokensOut);
    if (cost !== null) {
      costUsd = cost.toFixed(6);
    }
  }

  const entry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    model: params.model,
    providerId: params.providerId,
    comboId: params.comboId || null,
    apiKeyId: params.apiKeyId || null,
    connectionId: params.connectionId || null,
    tokensIn: params.tokensIn || null,
    tokensOut: params.tokensOut || null,
    latencyMs: params.latencyMs,
    status: params.status,
    isStreaming: params.isStreaming ?? false,
    costUsd,
    error: params.error || null,
    requestDetail: params.requestDetail || null,
    responseDetail: params.responseDetail || null,
  };

  db.insert(requestLogs).values(entry).run();

  logger.debug({
    model: params.model,
    providerId: params.providerId,
    connectionId: params.connectionId,
    status: params.status,
    latencyMs: params.latencyMs,
    tokensIn: params.tokensIn,
    tokensOut: params.tokensOut,
  }, "Request logged to DB");

  // Resolve API key name for SSE event (so real-time UI shows name, not "(deleted)")
  let apiKeyName: string | null = null;
  if (entry.apiKeyId) {
    const keyRow = db.select({ name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, entry.apiKeyId)).get();
    apiKeyName = keyRow?.name ?? null;
  }

  // Push to SSE subscribers (include resolved apiKeyName and connectionId for real-time display)
  notifySSE({ type: "log", data: { ...entry, apiKeyName, connectionId: params.connectionId || null } });
}
