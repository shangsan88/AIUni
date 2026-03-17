/**
 * SSRF (Server-Side Request Forgery) protection utilities.
 *
 * Validates URLs to prevent requests to internal/private network addresses.
 * Used by any API route that fetches a user-supplied URL server-side.
 */

/**
 * Parse an IPv4 address string into a 4-element number array.
 * Returns null if the string is not a valid IPv4 address.
 */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isNaN(n) || n < 0 || n > 255 || String(n) !== p ? -1 : n;
  });
  if (nums.some((n) => n < 0)) return null;
  return nums as [number, number, number, number];
}

/**
 * Check whether an IPv4 address belongs to a private or reserved range.
 *
 * Blocked ranges:
 *   0.0.0.0/8        – "This" network
 *   10.0.0.0/8       – Private (RFC 1918)
 *   100.64.0.0/10    – Carrier-grade NAT (RFC 6598)
 *   127.0.0.0/8      – Loopback
 *   169.254.0.0/16   – Link-local / cloud metadata
 *   172.16.0.0/12    – Private (RFC 1918)
 *   192.0.0.0/24     – IETF protocol assignments
 *   192.0.2.0/24     – Documentation (TEST-NET-1)
 *   192.88.99.0/24   – IPv6-to-IPv4 relay (deprecated)
 *   192.168.0.0/16   – Private (RFC 1918)
 *   198.18.0.0/15    – Benchmarking
 *   198.51.100.0/24  – Documentation (TEST-NET-2)
 *   203.0.113.0/24   – Documentation (TEST-NET-3)
 *   224.0.0.0/4      – Multicast
 *   240.0.0.0/4      – Reserved / broadcast
 */
function isPrivateIPv4(ip: [number, number, number, number]): boolean {
  const [a, b] = ip;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    (a === 169 && b === 254) || // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 0 && ip[2] === 0) || // 192.0.0.0/24
    (a === 192 && b === 0 && ip[2] === 2) || // 192.0.2.0/24
    (a === 192 && b === 88 && ip[2] === 99) || // 192.88.99.0/24
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    (a === 198 && b === 51 && ip[2] === 100) || // 198.51.100.0/24
    (a === 203 && b === 0 && ip[2] === 113) || // 203.0.113.0/24
    a >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  );
}

/**
 * Normalise an IPv6 address and check whether it is private / loopback /
 * link-local / an IPv4-mapped address that resolves to a private IPv4.
 *
 * Returns true if the address should be blocked.
 */
function isPrivateIPv6(raw: string): boolean {
  // Strip surrounding brackets used in URLs (e.g. [::1])
  let addr = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;

  // Strip zone IDs (%25eth0 etc.)
  const zoneIdx = addr.indexOf('%');
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

  addr = addr.toLowerCase();

  // Expand :: shorthand to full form for uniform handling
  const parts = addr.split(':');

  // IPv4-mapped / IPv4-compatible (::ffff:a.b.c.d or ::a.b.c.d)
  const last = parts[parts.length - 1];
  if (last && last.includes('.')) {
    const v4 = parseIPv4(last);
    if (v4 && isPrivateIPv4(v4)) return true;
  }

  // Unspecified (::) and loopback (::1)
  const expanded = expandIPv6(addr);
  if (
    addr === '::' ||
    addr === '::0' ||
    expanded === '0000:0000:0000:0000:0000:0000:0000:0001' ||
    /^0+:0+:0+:0+:0+:0+:0+:0+$/.test(expanded)
  ) {
    return true;
  }

  // fc00::/7 – unique local addresses
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true;

  // fe80::/10 – link-local
  if (addr.startsWith('fe80')) return true;

  // ff00::/8 – multicast
  if (addr.startsWith('ff')) return true;

  return false;
}

/** Expand an IPv6 :: shorthand into a full 8-group hex representation. */
function expandIPv6(addr: string): string {
  const halves = addr.split('::');
  if (halves.length === 1) {
    return halves[0]
      .split(':')
      .map((g) => g.padStart(4, '0'))
      .join(':');
  }
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const fill = 8 - left.length - right.length;
  const groups = [...left, ...Array(fill > 0 ? fill : 0).fill('0'), ...right];
  return groups.map((g: string) => g.padStart(4, '0')).join(':');
}

/**
 * Validate a URL against SSRF attacks.
 * Returns null if the URL is safe, or an error message string if blocked.
 */
export function validateUrlForSSRF(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Only HTTP(S) URLs are allowed';
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block well-known localhost hostnames
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return 'Local/private network URLs are not allowed';
  }

  // Block .local mDNS names
  if (hostname.endsWith('.local')) {
    return 'Local/private network URLs are not allowed';
  }

  // Check for bracketed IPv6
  if (hostname.startsWith('[') || parsed.hostname.startsWith('[')) {
    const rawIPv6 = parsed.hostname;
    if (isPrivateIPv6(rawIPv6)) {
      return 'Local/private network URLs are not allowed';
    }
    return null;
  }

  // Check for IPv4 literal
  const v4 = parseIPv4(hostname);
  if (v4) {
    if (isPrivateIPv4(v4)) {
      return 'Local/private network URLs are not allowed';
    }
    return null;
  }

  // Check for bare IPv6 without brackets (some URL parsers strip them)
  if (hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) {
      return 'Local/private network URLs are not allowed';
    }
  }

  // Check IPv6 prefixes on hostname (covers edge cases where brackets are removed)
  if (
    hostname.startsWith('fd') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fe80') ||
    hostname.startsWith('ff')
  ) {
    return 'Local/private network URLs are not allowed';
  }

  return null;
}
