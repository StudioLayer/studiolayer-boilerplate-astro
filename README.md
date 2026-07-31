# StudioLayer Astro Boilerplate

A ready-to-go starter for a website on **Astro SSR** with **StudioLayer** as a headless CMS. Fully env-driven and brandless: clone it, fill in `.env`, build.

> **Working with an AI agent on this repo?** Read [AGENTS.md](./AGENTS.md) first - it holds the hard rules (SSR-only, the `src/`-not-in-runtime gotcha, media cloaking, secrets, the indexing guard).

## Stack

- **Astro** in SSR mode (`output: 'server'`, `@astrojs/node` standalone)
- **Tailwind 4** via `@tailwindcss/vite`
- **@studiolayer/client** for content from the StudioLayer Content API
- **sharp** for server-side image resize + AVIF/WebP encoding
- **Docker** multi-stage, prod-ready (runs `node server.mjs`)

## Quick start

```bash
npm install
cp .env.example .env      # fill in STUDIOLAYER_API_KEY + STUDIOLAYER_PROJECT
npm run dev               # http://localhost:4321
```

Build & prod:

```bash
npm run build
npm run start             # node server.mjs (port 4321)
```

## Env

| Var | Required | Description |
|-----|----------|-------------|
| `PUBLIC_SITE_URL` | yes | Canonical production URL (OG tags, sitemap, indexing guard). No trailing slash. |
| `STUDIOLAYER_API_KEY` | yes | Content API key. **Store as a secret**, never commit. |
| `STUDIOLAYER_BASE_URL` | no | App origin. Default `https://app.studiolayer.io`. |
| `STUDIOLAYER_PROJECT` | yes | Project slug (determines the default media bucket). |
| `STUDIOLAYER_CDN_ORIGIN` | no | CDN host. Default `https://cdn.studiolayer.io`. |
| `STUDIOLAYER_CDN_BUCKET` | no | Override the bucket prefix for bare keys. |

## Media cloaking (`/cdn/<uuid>`)

All CMS images go through the same-origin proxy in `src/pages/cdn/[...key].ts`. The markup only ever contains `/cdn/<uuid>.webp` - visitors never see that the media comes from StudioLayer / an external CDN.

- **Bare key** `/cdn/<uuid>.webp` → default project bucket
- **Full path** `/cdn/agent-uploads/<uuid>.png` → other production folder
- **App file** `/cdn/_a/api/files/<uid>` → app origin
- `?w=640` → server-side resize
- `?f=avif|webp|jpeg|png` → force a format. Omit it and the proxy negotiates the best one from the browser's `Accept` header (AVIF > WebP), sending `Vary: Accept`.

The upstream host is fixed **server-side** (env), checked against a host whitelist (no SSRF), and the proxy caches in-memory (24h LRU) with `immutable` Cache-Control + width/format-aware ETag/304.

### In templates

The primitive - `cdn()` - works anywhere a URL goes (img, background-image, og:image, preload):

```astro
---
import { cdn } from '@/lib/studio';
---
<img src={cdn(post.cover, 640)} />
<div style={`background-image:url(${cdn(hero, { w: 1280, f: 'avif' })})`}></div>
```

`<CdnImage>` is the responsive wrapper (auto srcset, lazy/priority):

```astro
---
import CdnImage from '@/components/CdnImage.astro';
---
<CdnImage src={post.cover} alt={post.title} width={960}
          sizes="(min-width:768px) 50vw, 100vw" priority />
```

`<CdnSource>` builds a modern `<picture>` (AVIF → WebP fallback, smallest first):

```astro
---
import CdnImage from '@/components/CdnImage.astro';
import CdnSource from '@/components/CdnSource.astro';
---
<picture>
  <CdnSource src={post.cover} format="avif" widths={[640,960,1280]} sizes="50vw" />
  <CdnSource src={post.cover} format="webp" widths={[640,960,1280]} sizes="50vw" />
  <CdnImage  src={post.cover} alt={post.title} width={960} />
</picture>
```

Helpers also available: `cdnSrcSet(url, widths, format)`, `isProxyable(url)`. Legacy aliases `proxied` / `imgAtWidth` / `srcSet` still exist.

## Indexing guard

Only the canonical `PUBLIC_SITE_URL` host is indexable; every preview/staging host stays `noindex`. Enforced in three places off `isProdRequest()` in `src/lib/host.ts`:

- `middleware.ts` → `X-Robots-Tag: noindex` header on non-prod
- `src/pages/robots.txt.ts` → `Disallow: /` on non-prod, real policy on prod
- `Base.astro` → `<meta name="robots" content="noindex">` on non-prod

The node adapter reports `Astro.url.host` as `localhost`, so the real host is read from `x-forwarded-host` - always go through `isProdRequest()`, never compare the host directly.

## Production notes

The runtime container copies **only** `dist/`, `node_modules`, `server.mjs`, `package.json` - **not** `src/`. So server-side routes must never read from `src/` (`import.meta.url` + `node:fs`); that works locally but fails with a 500 in production. Runtime assets (fonts for OG images, etc.) belong in `public/` (they end up in `dist/client`) and load over HTTP (`fetch(\`${url.origin}/...\`)`).

## Structure

```
src/
  lib/studio.ts             # CMS client (re-exports the cdn helpers)
  lib/cdn.ts                # cloak helpers: cdn(), cdnSrcSet(), isProxyable()
  lib/host.ts               # request-host resolver + prod check (indexing guard)
  pages/cdn/[...key].ts      # media proxy (cloaking + resize + AVIF/WebP + cache)
  pages/robots.txt.ts        # dynamic robots.txt (prod-only crawl)
  pages/index.astro          # demo page
  components/CdnImage.astro   # responsive cloaked <img>
  components/CdnSource.astro  # <source> for a cloaked <picture>
  layouts/Base.astro         # <head>, OG tags, noindex meta, inline-editor embed
  middleware.ts              # CSP frame-ancestors + X-Robots-Tag
  styles/app.css             # Tailwind 4 + design tokens
server.mjs                   # prod server (immutable cache on static assets)
Dockerfile                   # multi-stage build
```
