# StudioLayer Astro Boilerplate

A ready-to-go starter for a website on **Astro 5 SSR** with **StudioLayer** as a headless CMS. Fully env-driven and brandless: clone it, fill in `.env`, build.

> **Working with an AI agent on this repo?** Read [AGENTS.md](./AGENTS.md) first - it holds the hard rules (SSR-only, the `src/`-not-in-runtime gotcha, media cloaking, secrets, the indexing guard).

## Stack

- **Astro 5** in SSR mode (`output: 'server'`, `@astrojs/node` standalone)
- **Tailwind 4** via `@tailwindcss/vite`
- **@studiolayer/client** for content from the StudioLayer Content API
- **sharp** for server-side image resizing
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
| `PUBLIC_SITE_URL` | yes | Canonical site URL (OG tags, sitemap). No trailing slash. |
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
- `?w=640` → server-side resize (WebP re-encode)

The upstream host is fixed **server-side** (env), checked against a host whitelist (no SSRF), and the proxy caches in-memory (24h LRU) with `immutable` Cache-Control + ETag/304.

Use it in templates via the helpers or the component:

```astro
---
import CmsImage from '@/components/CmsImage.astro';
// post.cover is an absolute StudioLayer/CDN URL
---
<CmsImage src={post.cover} alt={post.title} width={960} sizes="(min-width:768px) 50vw, 100vw" />
```

Or directly: `proxied(url)`, `imgAtWidth(url, 640)`, `srcSet(url, [320,640,960])` from `src/lib/studio.ts`.

## Production notes

The runtime container copies **only** `dist/`, `node_modules`, `server.mjs`, `package.json` - **not** `src/`. So server-side routes must never read from `src/` (`import.meta.url` + `node:fs`); that works locally but fails with a 500 in production. Runtime assets (fonts for OG images, etc.) belong in `public/` (they end up in `dist/client`).

## Structure

```
src/
  lib/studio.ts             # CMS client + cloak helpers (proxied/imgAtWidth/srcSet)
  pages/cdn/[...key].ts      # media proxy (cloaking + resize + cache)
  pages/index.astro          # demo page
  components/CmsImage.astro   # responsive cloaked <img>
  layouts/Base.astro         # <head>, OG tags, inline-editor embed
  middleware.ts              # CSP frame-ancestors (editor embed)
  styles/app.css             # Tailwind 4 + design tokens
server.mjs                   # prod server (immutable cache on static assets)
Dockerfile                   # multi-stage build
```
