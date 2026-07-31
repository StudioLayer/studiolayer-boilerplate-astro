import { defineMiddleware } from 'astro:middleware';
import { isProdRequest } from '@/lib/host';

/**
 * Two responsibilities:
 *
 * 1. CSP frame-ancestors so the site can be embedded in the StudioLayer inline
 *    editor (preview iframe on app.studiolayer.io), while staying protected
 *    against clickjacking elsewhere.
 *
 * 2. Indexing guard: only the canonical production host (PUBLIC_SITE_URL) may be
 *    indexed. Every other host (preview/staging deploys, raw IPs, localhost)
 *    gets `X-Robots-Tag: noindex, nofollow` so it never shows up in
 *    search. The dynamic robots.txt (src/pages/robots.txt.ts) does the same at
 *    the crawl level.
 */
const APP_ORIGIN = process.env.STUDIOLAYER_BASE_URL || 'https://app.studiolayer.io';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const res = await next();

  // CSP for the editor embed.
  const appHost = new URL(APP_ORIGIN).host;
  res.headers.set(
    'content-security-policy',
    `frame-ancestors 'self' ${APP_ORIGIN} https://*.${appHost.split('.').slice(-2).join('.')}`,
  );

  // Indexing guard: block everything that isn't the production host.
  if (!isProdRequest(ctx.request, ctx.url)) {
    res.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  return res;
});
