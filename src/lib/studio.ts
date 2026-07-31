/**
 * StudioLayer headless CMS client.
 *
 * Uses @studiolayer/client. Config is fully env-driven:
 *   STUDIOLAYER_API_KEY   - Content API key (store as a secret)
 *   STUDIOLAYER_BASE_URL  - app origin (default https://app.studiolayer.io)
 *   STUDIOLAYER_PROJECT   - project slug
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

// ─── Media cloaking (/cdn/<key>) ─────────────────────────────────────────────
//
// All CMS media is routed through the same-origin proxy at /cdn/<key>. Why:
//   1. The markup only ever contains /cdn/<uuid>.webp - visitors never see that
//      the media comes from an external CDN (StudioLayer).
//   2. Same-origin: no extra DNS/TLS handshake, no third-party cookies, and the
//      proxy can resize server-side and cache aggressively.
//
// The key shape MUST match resolveTarget() in src/pages/cdn/[...key].ts:
//   - bare "<uuid>.webp"            -> default project bucket
//   - "sub/dir/<uuid>.png"          -> full production path (e.g. agent-uploads)
//   - "_a/api/files/<uid>"          -> app-origin file (rare)

const CDN_ORIGIN = import.meta.env.STUDIOLAYER_CDN_ORIGIN || 'https://cdn.studiolayer.io';
const APP_ORIGIN = BASE_URL;
const BUCKET =
  (import.meta.env.STUDIOLAYER_CDN_BUCKET as string | undefined) ||
  (PROJECT ? `production/projects/${PROJECT}/` : 'production/');

const CDN_PREFIX = `${CDN_ORIGIN.replace(/\/$/, '')}/${BUCKET.replace(/^\/+/, '')}`;
const APP_PREFIX = `${APP_ORIGIN.replace(/\/$/, '')}/`;
const ROUTE = '/cdn/';

/**
 * Turn an absolute CMS/CDN URL into the same-origin /cdn/<key> form.
 * URLs from unknown origins (or non-raster images such as SVG) are returned
 * unchanged.
 */
export function proxied(url: string | null | undefined): string {
  if (!url) return '';
  // Already same-origin? leave it.
  if (url.startsWith(ROUTE) || url.startsWith('/')) return url;

  // CDN bucket -> bare key.
  if (url.startsWith(CDN_PREFIX)) {
    return ROUTE + url.slice(CDN_PREFIX.length);
  }
  // Other production folder on the same CDN (e.g. agent-uploads) -> full path.
  const cdnRoot = `${CDN_ORIGIN.replace(/\/$/, '')}/production/`;
  if (url.startsWith(cdnRoot)) {
    return ROUTE + url.slice(cdnRoot.length);
  }
  // app-origin file -> _a marker.
  if (url.startsWith(`${APP_PREFIX}api/files/`)) {
    return ROUTE + '_a/api/files/' + url.slice(`${APP_PREFIX}api/files/`.length);
  }
  // Unknown origin: not proxyable, return unchanged.
  return url;
}

/** Appends a resize width to a proxied src. */
export function imgAtWidth(url: string | null | undefined, width: number): string {
  const src = proxied(url);
  if (!src.startsWith(ROUTE)) return src;
  const sep = src.includes('?') ? '&' : '?';
  return `${src}${sep}w=${width}`;
}

/** Builds a srcset string from a set of widths. */
export function srcSet(
  url: string | null | undefined,
  widths: number[] = [320, 480, 640, 960, 1280],
): string {
  const src = proxied(url);
  if (!src.startsWith(ROUTE)) return '';
  return widths.map((w) => `${imgAtWidth(url, w)} ${w}w`).join(', ');
}
