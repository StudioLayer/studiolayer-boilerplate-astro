/**
 * StudioLayer headless CMS client.
 *
 * Uses @studiolayer/client. Config is fully env-driven:
 *   STUDIOLAYER_API_KEY   - Content API key (store as a secret)
 *   STUDIOLAYER_BASE_URL  - app origin (default https://app.studiolayer.io)
 *   STUDIOLAYER_PROJECT   - project slug
 *
 * Media/cloaking helpers live in src/lib/cdn.ts; they are re-exported here for
 * convenience (`import { cdn } from '@/lib/studio'` keeps working).
 */
import { createClient } from '@studiolayer/client';

const BASE_URL = import.meta.env.STUDIOLAYER_BASE_URL || 'https://app.studiolayer.io';
const API_KEY = import.meta.env.STUDIOLAYER_API_KEY;
const PROJECT = import.meta.env.STUDIOLAYER_PROJECT || '';

if (!API_KEY) {
  // Warn loudly during SSR instead of silently rendering empty data.
  console.warn('[studio] STUDIOLAYER_API_KEY is missing - CMS calls will fail.');
}

export const studio = createClient({
  baseUrl: BASE_URL,
  apiKey: API_KEY,
  project: PROJECT,
});

export function clearStudioCache() {
  studio.clearCache();
}

// Re-export the media-cloaking helpers so existing imports keep working.
export { cdn, cdnSrcSet, isProxyable, proxied, imgAtWidth, srcSet, type CdnFormat, type CdnOpts } from './cdn';
