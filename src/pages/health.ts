import type { APIRoute } from 'astro';

/**
 * Liveness probe for uptime monitors / container healthchecks.
 * Cheap and dependency-free: it only proves the node process is up and serving,
 * it does NOT hit the CMS (so a CMS outage never marks the container unhealthy).
 *   GET /health -> 200 { ok: true, uptime, ts }
 */
export const prerender = false;

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), ts: Date.now() }),
    { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
  );
};
