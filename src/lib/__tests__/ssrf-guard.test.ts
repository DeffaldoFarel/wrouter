import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dns module before importing the module under test
vi.mock('dns', () => {
  const lookup = vi.fn();
  return {
    default: { promises: { lookup } },
    promises: { lookup },
  };
});

import dns from 'dns';
import { validateUrl } from '../ssrf-guard';

const mockLookup = vi.mocked(dns.promises.lookup);

describe('ssrf-guard — validateUrl()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Protocol checks ──────────────────────────────────────────────
  describe('protocol validation', () => {
    it('accepts https:// for a public hostname', async () => {
      mockLookup.mockResolvedValue([{ address: '52.20.16.20', family: 4 }]);
      const result = await validateUrl('https://api.openai.com/v1/models');
      expect(result.valid).toBe(true);
    });

    it('accepts http:// for a public hostname', async () => {
      mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
      const result = await validateUrl('http://example.com/path');
      expect(result.valid).toBe(true);
    });

    it('blocks ftp:// protocol', async () => {
      const result = await validateUrl('ftp://example.com/file');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/protocol/i);
    });

    it('blocks file:// protocol', async () => {
      const result = await validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/protocol/i);
    });
  });

  // ── Invalid URL ──────────────────────────────────────────────────
  describe('invalid URL format', () => {
    it('returns error for a completely invalid URL string', async () => {
      const result = await validateUrl('not a url at all');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });
  });

  // ── Blocked hostnames ────────────────────────────────────────────
  describe('blocked hostnames', () => {
    it('blocks http://localhost/', async () => {
      const result = await validateUrl('http://localhost/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/localhost/i);
    });

    it('blocks http://localhost:8080/api', async () => {
      const result = await validateUrl('http://localhost:8080/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/localhost/i);
    });

    it('blocks http://app.localhost/api', async () => {
      const result = await validateUrl('http://app.localhost/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/localhost/i);
    });

    it('blocks http://server.local/api', async () => {
      const result = await validateUrl('http://server.local/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/local/i);
    });

    it('blocks http://db.internal/api', async () => {
      const result = await validateUrl('http://db.internal/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/internal/i);
    });
  });

  // ── Raw IP addresses ─────────────────────────────────────────────
  describe('raw IP address blocking', () => {
    it('blocks http://127.0.0.1/ (loopback)', async () => {
      const result = await validateUrl('http://127.0.0.1/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks http://10.0.0.1/ (private class A)', async () => {
      const result = await validateUrl('http://10.0.0.1/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks http://192.168.1.1/ (private class C)', async () => {
      const result = await validateUrl('http://192.168.1.1/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks http://169.254.169.254/ (cloud metadata endpoint)', async () => {
      const result = await validateUrl('http://169.254.169.254/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks http://172.16.0.1/ (private class B)', async () => {
      const result = await validateUrl('http://172.16.0.1/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks http://172.31.255.255/ (upper end of 172.16/12)', async () => {
      const result = await validateUrl('http://172.31.255.255/');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('allows a public IP address directly', async () => {
      const result = await validateUrl('http://8.8.8.8/');
      expect(result.valid).toBe(true);
    });
  });

  // ── DNS resolution with mocked private IPs ───────────────────────
  describe('DNS resolution to private IPs', () => {
    it('blocks when DNS resolves to 127.0.0.1', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      const result = await validateUrl('https://evil.example.com/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks when DNS resolves to 10.x private range', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
      const result = await validateUrl('https://proxy.example.com/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('blocks when one of multiple DNS addresses is private', async () => {
      mockLookup.mockResolvedValue([
        { address: '8.8.8.8', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]);
      const result = await validateUrl('https://mixed.example.com/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/private/i);
    });

    it('allows when all DNS addresses are public', async () => {
      mockLookup.mockResolvedValue([
        { address: '8.8.8.8', family: 4 },
        { address: '1.1.1.1', family: 4 },
      ]);
      const result = await validateUrl('https://good.example.com/api');
      expect(result.valid).toBe(true);
    });

    it('blocks when DNS resolution fails', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      const result = await validateUrl('https://nonexistent.invalid/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/DNS/i);
    });

    it('blocks when DNS returns no addresses', async () => {
      mockLookup.mockResolvedValue([]);
      const result = await validateUrl('https://empty.example.com/api');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/no dns/i);
    });
  });

  // ── IPv6 ─────────────────────────────────────────────────────────
  describe('IPv6 addresses', () => {
    it('blocks ::1 (IPv6 loopback) as raw IP', async () => {
      // URL parses [::1] hostname with brackets — isIP() doesn't match,
      // so it falls through to DNS which fails (blocked either way).
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      const result = await validateUrl('http://[::1]/');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('blocks ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      const result = await validateUrl('http://[::ffff:127.0.0.1]/');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
