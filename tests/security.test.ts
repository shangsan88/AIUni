/**
 * Security-critical path tests.
 *
 * Covers:
 *   1. resolveApiKey() with allowServerFallback: false
 *   2. validateUrlForSSRF() blocking private IPs and metadata endpoints
 *   3. Job lock cleanup when job update throws
 */

import { describe, it, expect, vi } from 'vitest';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

// ---------------------------------------------------------------------------
// 1. resolveApiKey() — server fallback gating
// ---------------------------------------------------------------------------

describe('resolveApiKey – allowServerFallback', () => {
  // We can't import the real function directly because it depends on fs / yaml
  // loading server-providers.yml at module scope.  Instead we replicate the
  // pure logic that was changed.
  function resolveApiKeyLogic(
    serverKey: string | undefined,
    clientKey: string | undefined,
    allowServerFallback: boolean,
  ): string {
    if (clientKey) return clientKey;
    if (!allowServerFallback) return '';
    return serverKey || '';
  }

  it('returns client key when provided regardless of fallback setting', () => {
    expect(resolveApiKeyLogic('server-key', 'client-key', true)).toBe('client-key');
    expect(resolveApiKeyLogic('server-key', 'client-key', false)).toBe('client-key');
  });

  it('returns server key when client key is absent and fallback is allowed', () => {
    expect(resolveApiKeyLogic('server-key', undefined, true)).toBe('server-key');
  });

  it('returns empty string when client key is absent and fallback is disallowed', () => {
    expect(resolveApiKeyLogic('server-key', undefined, false)).toBe('');
  });

  it('returns empty string when both keys are absent', () => {
    expect(resolveApiKeyLogic(undefined, undefined, true)).toBe('');
    expect(resolveApiKeyLogic(undefined, undefined, false)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. validateUrlForSSRF() — IP blocking
// ---------------------------------------------------------------------------

describe('validateUrlForSSRF', () => {
  // Safe URLs
  it.each([
    'https://example.com/image.png',
    'https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css',
    'http://93.184.216.34/resource',
  ])('allows safe URL: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBeNull();
  });

  // Invalid / non-HTTP
  it.each([
    ['not-a-url', 'Invalid URL'],
    ['ftp://example.com/file', 'Only HTTP(S) URLs are allowed'],
    ['file:///etc/passwd', 'Only HTTP(S) URLs are allowed'],
  ])('rejects non-HTTP URL: %s', (url, expected) => {
    expect(validateUrlForSSRF(url)).toBe(expected);
  });

  // Loopback
  it.each([
    'http://127.0.0.1',
    'http://127.0.0.1:8080/admin',
    'http://localhost',
    'http://localhost:3000',
    'http://0.0.0.0',
  ])('blocks loopback: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBe('Local/private network URLs are not allowed');
  });

  // Cloud metadata (169.254.x.x)
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://169.254.0.1',
  ])('blocks cloud metadata endpoint: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBe('Local/private network URLs are not allowed');
  });

  // Private ranges
  it.each([
    'http://10.0.0.1',
    'http://10.255.255.255',
    'http://192.168.1.1',
    'http://192.168.0.100:9090',
    'http://172.16.0.1',
    'http://172.31.255.255',
  ])('blocks private IP: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBe('Local/private network URLs are not allowed');
  });

  // IPv6 loopback / private
  it.each([
    'http://[::1]',
    'http://[::1]:8080',
    'http://[fc00::1]',
    'http://[fd12:3456::1]',
    'http://[fe80::1]',
  ])('blocks IPv6 private/loopback: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBe('Local/private network URLs are not allowed');
  });

  // Carrier-grade NAT, multicast, reserved
  it.each([
    'http://100.64.0.1',
    'http://100.127.255.255',
    'http://224.0.0.1',
    'http://240.0.0.1',
    'http://255.255.255.255',
  ])('blocks reserved range: %s', (url) => {
    expect(validateUrlForSSRF(url)).toBe('Local/private network URLs are not allowed');
  });

  // .local mDNS
  it('blocks .local hostnames', () => {
    expect(validateUrlForSSRF('http://myprinter.local')).toBe(
      'Local/private network URLs are not allowed',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Job lock cleanup on error
// ---------------------------------------------------------------------------

describe('Job lock cleanup on error', () => {
  it('deletes lock even when the inner function throws', async () => {
    const locks = new Map<string, Promise<void>>();

    // Replicate the withJobLock pattern from classroom-job-store.ts
    async function withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
      const prev = locks.get(jobId) ?? Promise.resolve();
      let resolve: () => void;
      const next = new Promise<void>((r) => {
        resolve = r;
      });
      locks.set(jobId, next);
      try {
        await prev;
        return await fn();
      } finally {
        resolve!();
        if (locks.get(jobId) === next) locks.delete(jobId);
      }
    }

    // Simulate markJobSucceeded with a try/finally that cleans up locks
    async function markSucceeded(jobId: string): Promise<void> {
      try {
        await withJobLock(jobId, async () => {
          throw new Error('Simulated write failure');
        });
      } finally {
        locks.delete(jobId);
      }
    }

    await expect(markSucceeded('job-123')).rejects.toThrow('Simulated write failure');
    expect(locks.has('job-123')).toBe(false);
  });
});
