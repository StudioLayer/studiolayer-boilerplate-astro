import type { APIRoute } from 'astro';
import sharp from 'sharp';

/**
 * Same-origin media proxy with server-side cloaking + resize.
 *
 * URL shape (public):
 *   /cdn/<uuid>.webp              -> default project bucket
 *   /cdn/<uuid>.webp?w=640        -> + server-side resize to 640px wide
 *   /cdn/sub/dir/<uuid>.png       -> full production path (e.g. agent-uploads)
 *   /cdn/_a/api/files/<uid>       -> app-origin file (rare)
 *
 * The upstream host is hardcoded SERVER-SIDE (via env), never in the client URL.
 * So nothing in the markup/network tab reveals the media comes from StudioLayer,
 * and there is no SSRF risk: the visitor only supplies a path key, not a host.
 *
 * Perf: in-memory LRU (24h TTL), WebP re-encode, width-aware ETag/304,
 * `immutable` Cache-Control. Same-origin, so no third-party cookies.
 */

export const prerender = false;

// ─── Config (env-driven) ─────────────────────────────────────────────────────
const CDN_ORIGIN = (process.env.STUDIOLAYER_CDN_ORIGIN || 'https://cdn.studiolayer.io').replace(/\/$/, '');
const APP_ORIGIN = (process.env.STUDIOLAYER_BASE_URL || 'https://app.studiolayer.io').replace(/\/$/, '');
const PROJECT = process.env.STUDIOLAYER_PROJECT || '';
const BUCKET = (
  process.env.STUDIOLAYER_CDN_BUCKET ||
  (PROJECT ? `production/projects/${PROJECT}/` : 'production/')
).replace(/^\/+/, '');

// Whitelist of allowed upstream hosts. Anything else -> 403.
const ALLOWED_HOSTS = new Set(
  [CDN_ORIGIN, APP_ORIGIN].map((o) => new URL(o).host),
);

// Cache config
const MAX_ENTRIES = 256;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_WIDTH = 2048;

type Entry = { body: Buffer; type: string; etag: string; at: number };
const cache = new Map<string, Entry>();

function cacheGet(key: string): Entry | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // LRU touch
  cache.delete(key);
  cache.set(key, e);
  return e;
}

function cacheSet(key: string, e: Entry) {
  cache.set(key, e);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Resolve the public key to the real upstream URL.
 * Uses new URL(rel, base) so that traversal (../) stays within the base; the
 * resulting host is then re-checked against the whitelist.
 */
function resolveTarget(key: string): URL | null {
  let base: string;
  let rel: string;

  if (key.startsWith('_a/')) {
    // app-origin file
    base = `${APP_ORIGIN}/`;
    rel = key.slice('_a/'.length);
  } else if (key.includes('/')) {
    // full production path (e.g. agent-uploads/<uuid>.png)
    base = `${CDN_ORIGIN}/production/`;
    rel = key;
  } else {
    // bare key -> default bucket
    base = `${CDN_ORIGIN}/${BUCKET}`;
    rel = key;
  }

  try {
    const u = new URL(rel, base.endsWith('/') ? base : `${base}/`);
    if (!ALLOWED_HOSTS.has(u.host)) return null;
    // Prevent the resolve from escaping the intended origin.
    if (u.origin !== CDN_ORIGIN && u.origin !== APP_ORIGIN) return null;
    return u;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  const key = (params.key || '').toString();
  if (!key) return new Response('Not found', { status: 404 });

  const target = resolveTarget(key);
  if (!target) return new Response('Forbidden', { status: 403 });

  // resize width
  const url = new URL(request.url);
  const wParam = url.searchParams.get('w');
  let width = wParam ? parseInt(wParam, 10) : 0;
  if (!Number.isFinite(width) || width <= 0) width = 0;
  if (width > MAX_WIDTH) width = MAX_WIDTH;

  const cacheKey = `${target.href}::w${width}`;
  const hit = cacheGet(cacheKey);

  // 304 handling
  const inm = request.headers.get('if-none-match');
  if (hit && inm && inm === hit.etag) {
    return new Response(null, { status: 304, headers: cacheHeaders(hit.type, hit.etag) });
  }
  if (hit) {
    return new Response(hit.body, { status: 200, headers: cacheHeaders(hit.type, hit.etag) });
  }

  // Fetch upstream
  let upstream: Response;
  try {
    upstream = await fetch(target.href, { headers: { accept: 'image/*' } });
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }
  if (!upstream.ok) {
    return new Response('Upstream error', { status: upstream.status === 404 ? 404 : 502 });
  }

  const upstreamType = upstream.headers.get('content-type') || '';
  if (!upstreamType.startsWith('image/')) {
    return new Response('Not an image', { status: 415 });
  }

  const input = Buffer.from(await upstream.arrayBuffer());

  // Resize + WebP re-encode. Leave SVG and GIF untouched.
  let body = input;
  let type = upstreamType;
  const reencodable = /image\/(jpe?g|png|webp|avif|tiff)/.test(upstreamType);
  if (reencodable) {
    try {
      let pipe = sharp(input, { failOn: 'none' });
      if (width > 0) pipe = pipe.resize({ width, withoutEnlargement: true });
      body = await pipe.webp({ quality: 82 }).toBuffer();
      type = 'image/webp';
    } catch {
      body = input;
      type = upstreamType;
    }
  }

  const etag = `"${hashBuf(body)}"`;
  cacheSet(cacheKey, { body, type, etag, at: Date.now() });

  if (inm && inm === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders(type, etag) });
  }
  return new Response(body, { status: 200, headers: cacheHeaders(type, etag) });
};

function cacheHeaders(type: string, etag: string): Record<string, string> {
  return {
    'content-type': type,
    'cache-control': 'public, max-age=31536000, immutable',
    etag,
  };
}

// Fast, non-cryptographic hash for the ETag.
function hashBuf(buf: Buffer): string {
  let h = 2166136261;
  for (let i = 0; i < buf.length; i += 997) {
    h = (h ^ buf[i]) >>> 0;
    h = (h * 16777619) >>> 0;
  }
  return (h >>> 0).toString(36) + '-' + buf.length.toString(36);
}
