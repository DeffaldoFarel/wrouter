import dns from "dns";
import { isIP } from "net";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const BLOCKED_HOSTNAMES = ["localhost"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal"];

// ─── DNS Cache ───
// Cache DNS lookups to avoid repeated lookups for the same hostname.
// Provider URLs rarely change, so a 5-minute TTL is safe.
interface DnsCacheEntry {
  addresses: dns.LookupAddress[];
  timestamp: number;
}

const dnsCache = new Map<string, DnsCacheEntry>();
const DNS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getDnsCache(hostname: string): dns.LookupAddress[] | null {
  const entry = dnsCache.get(hostname);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > DNS_CACHE_TTL) {
    dnsCache.delete(hostname);
    return null;
  }
  
  return entry.addresses;
}

function setDnsCache(hostname: string, addresses: dns.LookupAddress[]): void {
  dnsCache.set(hostname, { addresses, timestamp: Date.now() });
}

/**
 * Check if a hostname matches blocked patterns:
 * localhost, *.localhost, *.local, *.internal
 */
function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(lower)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Check if an IPv4 address falls in a private/reserved range:
 *  - 0.0.0.0/8
 *  - 127.0.0.0/8 (loopback)
 *  - 10.0.0.0/8 (private)
 *  - 172.16.0.0/12 (private)
 *  - 192.168.0.0/16 (private)
 *  - 169.254.0.0/16 (link-local / cloud metadata)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed — block to be safe
  }

  const [a, b] = parts;

  if (a === 0) return true;                   // 0.0.0.0/8
  if (a === 127) return true;                 // 127.0.0.0/8
  if (a === 10) return true;                  // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;    // 192.168.0.0/16
  if (a === 169 && b === 254) return true;    // 169.254.0.0/16

  return false;
}

/**
 * Check if an IPv6 address falls in a private/reserved range:
 *  - ::1 (loopback)
 *  - fc00::/7 (unique local: fc00:: – fdff::)
 *  - fe80::/10 (link-local: fe80:: – febf::)
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 loopback
  if (lower === "::1") return true;

  // fc00::/7 — first byte 0xfc or 0xfd
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  // fe80::/10 — first byte 0xfe, second byte 0x80–0xbf
  if (/^fe[89ab]/.test(lower)) return true;

  return false;
}

/**
 * Check whether an IP address (v4 or v6) is private/internal.
 * Also handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x).
 */
function isPrivateIP(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) {
    return isPrivateIPv4(ip);
  }

  if (version === 6) {
    // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
    const lower = ip.toLowerCase();
    if (lower.startsWith("::ffff:")) {
      const ipv4Part = ip.slice(7);
      if (isIP(ipv4Part) === 4) {
        return isPrivateIPv4(ipv4Part);
      }
    }
    return isPrivateIPv6(ip);
  }

  // Unknown format — block to be safe
  return true;
}

/**
 * Validate that a URL is safe to fetch (no SSRF).
 *
 * Checks:
 *  1. Valid URL syntax
 *  2. Protocol is http: or https:
 *  3. Hostname is not a blocked pattern
 *  4. Resolved IP(s) are not private/internal
 */
export async function validateUrl(urlString: string): Promise<ValidationResult> {
  // 1. Parse
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // 2. Protocol
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Protocol "${parsed.protocol}" is not allowed. Only http and https are permitted.`,
    };
  }

  const hostname = parsed.hostname;

  // 3. Blocked hostnames
  if (isBlockedHostname(hostname)) {
    return { valid: false, error: `Hostname "${hostname}" is blocked.` };
  }

  // 4a. If hostname is already a raw IP, check it directly
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return {
        valid: false,
        error: `IP address "${hostname}" is a private/internal address.`,
      };
    }
    return { valid: true };
  }

  // 4b. Resolve DNS and check every returned address (with cache)
  let addresses: dns.LookupAddress[] | null = getDnsCache(hostname);
  
  if (!addresses) {
    // Cache miss — do DNS lookup
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
      if (addresses) {
        setDnsCache(hostname, addresses);
      }
    } catch (err) {
      return {
        valid: false,
        error: `DNS resolution failed for "${hostname}": ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  if (!addresses || !addresses.length) {
    return { valid: false, error: `No DNS records found for "${hostname}".` };
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      return {
        valid: false,
        error: `Hostname "${hostname}" resolves to private/internal IP "${address}".`,
      };
    }
  }

  return { valid: true };
}
