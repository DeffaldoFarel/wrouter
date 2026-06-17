/**
 * WRouter Changelog Data
 * This file contains structured changelog data for the in-app changelog viewer.
 */

export type ChangeType = "added" | "changed" | "fixed";

export interface Change {
  type: ChangeType;
  title: string;
  description: string;
}

export interface Release {
  version: string;
  date: string;
  changes: Change[];
}

export const changelog: Release[] = [
  {
    version: "1.1.0",
    date: "2025-06-18",
    changes: [
      {
        type: "added",
        title: "DeepSeek Provider Support",
        description: "Native integration with DeepSeek API (DeepSeek V4 Flash, V4 Pro)",
      },
      {
        type: "added",
        title: "Google Gemini Provider Support",
        description: "Native integration with Google Gemini API (Gemini 3.5 Flash, 3.1 Pro, 2.5 series)",
      },
      {
        type: "added",
        title: "OpenRouter Provider Sort",
        description: "Automatic routing to cheapest, fastest, or highest-throughput provider",
      },
      {
        type: "added",
        title: "Provider Routing Preferences",
        description: "Configure OpenRouter to prioritize price, throughput, or latency",
      },
      {
        type: "added",
        title: "Visual Canvas",
        description: "Drag-and-drop interface for designing routing combos and fallback chains",
      },
      {
        type: "added",
        title: "RTK (Response Token Keeper)",
        description: "Intelligent response caching and token compression",
      },
      {
        type: "added",
        title: "Caveman Mode",
        description: "Aggressive response compression (up to 40% token savings) while preserving meaning",
      },
      {
        type: "added",
        title: "SSRF Guard",
        description: "Security layer preventing Server-Side Request Forgery on custom provider endpoints",
      },
      {
        type: "added",
        title: "In-App Changelog",
        description: "View version history directly in the dashboard",
      },
      {
        type: "added",
        title: "Auto Model Fetch",
        description: "Automatically fetch available models from provider APIs",
      },
      {
        type: "changed",
        title: "Provider Setup Flow",
        description: "Improved with real-time model validation",
      },
      {
        type: "changed",
        title: "Dashboard UI",
        description: "Enhanced with better visual feedback",
      },
      {
        type: "changed",
        title: "Routing Engine",
        description: "Optimized for faster fallback execution",
      },
      {
        type: "fixed",
        title: "Provider Timeout Handling",
        description: "Fixed timeout handling in combo chains",
      },
      {
        type: "fixed",
        title: "API Key Encryption",
        description: "Resolved edge cases in API key encryption",
      },
      {
        type: "fixed",
        title: "Model Selection",
        description: "Fixed persistence across page reloads",
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2025-06-15",
    changes: [
      {
        type: "fixed",
        title: "Database Migration",
        description: "Fixed database migration issues",
      },
      {
        type: "fixed",
        title: "Error Handling",
        description: "Improved error handling for invalid API keys",
      },
      {
        type: "fixed",
        title: "CORS Configuration",
        description: "Fixed CORS configuration for production deployments",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2025-06-10",
    changes: [
      {
        type: "added",
        title: "Unified API",
        description: "Single OpenAI-compatible endpoint for all providers",
      },
      {
        type: "added",
        title: "Multi-Provider Support",
        description: "OpenAI, Anthropic, OpenRouter, and custom OpenAI-compatible providers",
      },
      {
        type: "added",
        title: "Smart Combos",
        description: "Provider fallback chains with automatic failover",
      },
      {
        type: "added",
        title: "Admin Dashboard",
        description: "Full-featured web UI for provider and API key management",
      },
      {
        type: "added",
        title: "Usage Analytics",
        description: "Track tokens, requests, latency, and costs",
      },
      {
        type: "added",
        title: "Request Logs",
        description: "Detailed request/response logging with timing data",
      },
      {
        type: "added",
        title: "API Key Management",
        description: "Generate, revoke, and scope API keys",
      },
      {
        type: "added",
        title: "Provider Management",
        description: "Add, edit, enable/disable providers",
      },
      {
        type: "added",
        title: "Security",
        description: "Password hashing, rate limiting, security headers, CORS policy",
      },
    ],
  },
];
