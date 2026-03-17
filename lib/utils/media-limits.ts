/**
 * IndexedDB Media Limits & Cleanup
 *
 * 1. Provides a size-check guard (`assertBlobSize`) to reject blobs > 50 MB
 *    before they are written to Dexie.
 * 2. Provides a cleanup utility (`cleanupOldMedia`) that removes media blobs
 *    older than 7 days.  Should be called once on app startup.
 */

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('MediaLimits');

/** Maximum blob size in bytes (50 MB). */
export const MAX_BLOB_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum age in milliseconds before a media blob becomes eligible for cleanup (7 days). */
const MAX_MEDIA_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Assert that a Blob does not exceed the maximum allowed size.
 * Throws an error (with a user-facing message) if the blob is too large.
 */
export function assertBlobSize(blob: Blob, label = 'Media'): void {
  if (blob.size > MAX_BLOB_SIZE_BYTES) {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `${label} exceeds the maximum allowed size of 50 MB (actual: ${sizeMB} MB). ` +
        'Please reduce the media resolution or file size.',
    );
  }
}

/**
 * Remove media blobs (audio, image, mediaFiles) older than 7 days.
 *
 * Safe to call on every app startup — it only touches records whose
 * `createdAt` timestamp is older than the threshold.
 */
export async function cleanupOldMedia(): Promise<void> {
  const cutoff = Date.now() - MAX_MEDIA_AGE_MS;

  try {
    const [audioCount, imageCount, mediaCount] = await Promise.all([
      db.audioFiles.where('createdAt').below(cutoff).delete(),
      db.imageFiles.where('createdAt').below(cutoff).delete(),
      db.mediaFiles.filter((r) => r.createdAt < cutoff).delete(),
    ]);

    const total = audioCount + imageCount + mediaCount;
    if (total > 0) {
      log.info(
        `Cleaned up ${total} old media records (${audioCount} audio, ${imageCount} images, ${mediaCount} media)`,
      );
    }
  } catch (e) {
    log.warn('Media cleanup failed (non-fatal):', e);
  }
}
