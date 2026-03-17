/**
 * Encrypted Storage Adapter for Zustand `persist` middleware.
 *
 * Uses the Web Crypto API (AES-GCM) to encrypt store data before writing
 * to localStorage and decrypt on read.  The encryption key is generated once
 * and stored in IndexedDB (not localStorage) to provide an extra layer of
 * isolation — an XSS payload that reads localStorage cannot decrypt the data
 * without also querying IndexedDB.
 *
 * Usage:
 *   import { createEncryptedStorage } from './encrypted-storage';
 *   persist(fn, { storage: createEncryptedStorage() })
 */

import type { StateStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IDB_DB_NAME = 'maic-key-store';
const IDB_STORE_NAME = 'keys';
const IDB_KEY_ID = 'zustand-encryption-key';
const ALGO: AesGcmParams['name'] = 'AES-GCM';
const KEY_LENGTH = 256;

// ---------------------------------------------------------------------------
// IndexedDB helpers (key persistence)
// ---------------------------------------------------------------------------

function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadRawKey(): Promise<JsonWebKey | null> {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.get(IDB_KEY_ID);
    req.onsuccess = () => resolve((req.result as JsonWebKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveRawKey(jwk: JsonWebKey): Promise<void> {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.put(jwk, IDB_KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Crypto key management
// ---------------------------------------------------------------------------

let _cachedKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const existing = await loadRawKey();
  if (existing) {
    _cachedKey = await crypto.subtle.importKey('jwk', existing, { name: ALGO, length: KEY_LENGTH }, true, [
      'encrypt',
      'decrypt',
    ]);
    return _cachedKey;
  }

  // First run: generate a new key
  const key = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await saveRawKey(jwk);
  _cachedKey = key;
  return key;
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

async function encrypt(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);

  // Pack iv + ciphertext into a single base64 string
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decrypt(encoded: string): Promise<string> {
  const key = await getOrCreateKey();
  const packed = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// Zustand StateStorage adapter
// ---------------------------------------------------------------------------

/** Prefix added to encrypted payloads to distinguish them from plaintext JSON. */
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Create an encrypted storage adapter compatible with Zustand `persist`.
 *
 * Data written via `setItem` is AES-GCM encrypted before being stored in
 * localStorage.  `getItem` transparently decrypts.  If decryption fails
 * (e.g. key was lost), the item is removed and `null` is returned so
 * Zustand reinitialises with defaults.
 */
export function createEncryptedStorage(): StateStorage {
  return {
    async getItem(name: string): Promise<string | null> {
      const raw = localStorage.getItem(name);
      if (!raw) return null;

      // If the value does not carry our encrypted prefix, it is a legacy
      // plaintext JSON value — return it as-is so Zustand can read and
      // re-persist (which will encrypt it on the next write).
      if (!raw.startsWith(ENCRYPTED_PREFIX)) {
        return raw;
      }

      try {
        return await decrypt(raw.slice(ENCRYPTED_PREFIX.length));
      } catch {
        // Key mismatch or corrupted data — clear and let Zustand re-init
        localStorage.removeItem(name);
        return null;
      }
    },

    async setItem(name: string, value: string): Promise<void> {
      const encrypted = await encrypt(value);
      localStorage.setItem(name, ENCRYPTED_PREFIX + encrypted);
    },

    async removeItem(name: string): Promise<void> {
      localStorage.removeItem(name);
    },
  };
}
