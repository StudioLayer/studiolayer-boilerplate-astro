# Agent guide

Rules and context for AI agents working in this repo. Read this before editing.
(Cross-tool convention: Claude Code, Cursor, Copilot, etc. `CLAUDE.md` points here.)

## What this is

A brandless starter for a website on **Astro 5 SSR** with **StudioLayer** as a
headless CMS. Everything is env-driven: no client name, domain or key is
hardcoded. When you build a real site on top of this, keep it that way.

## Stack (do not swap without being asked)

- Astro 5, `output: 'server'`, `@astrojs/node` standalone adapter
- Tailwind 4 via `@tailwindcss/vite` (no `tailwind.config.js` - tokens live in `src/styles/app.css` under `@theme`)
- `@studiolayer/client` for all CMS reads
- `sharp` for server-side image resizing
- TypeScript strict, path alias `@/*` -> `src/*`

## Hard rules

1. **SSR only, never static.** The site runs as a node server (`npm run start`
   -> `server.mjs`). Do not switch to `output: 'static'` or add `prerender = true`
   to routes that read request data (host, headers, cookies).

2. **Server-side routes must NEVER read from `src/`.** The runtime container
   copies only `dist/`, `node_modules`, `server.mjs`, `package.json` - **not**
   `src/`. Reading a file from `src/` via `import.meta.url` + `node:fs` works
   locally and 500s in production. Runtime assets (fonts for OG images, etc.)
   belong in `public/` (they land in `dist/client`); load them over HTTP
   (`fetch(`${url.origin}/...`)`), not from the filesystem.

3. **All CMS media goes through `/cdn/<key>`.** Never emit a raw
   `cdn.studiolayer.io` / `app.studiolayer.io` URL into the markup - it leaks the
   backend and skips resizing/caching. Use `proxied()` / `imgAtWidth()` /
   `srcSet()` from `src/lib/studio.ts`, or the `<CmsImage>` component. If you add
   a new media source, extend `resolveTarget()` in `src/pages/cdn/[...key].ts`
   AND `proxied()` together - their key shapes must stay in sync.

4. **Never hardcode or commit secrets.** `STUDIOLAYER_API_KEY` and friends come
   from env only. `.env` is gitignored; only `.env.example` is committed. When a
   new secret is needed, add it to `.env.example` (empty) and document it in the
   README table.

5. **Don't break the indexing guard.** Only the canonical `PUBLIC_SITE_URL` host
   may be indexed; every preview/staging host must stay `noindex`. The logic
   lives in `src/lib/host.ts` and is applied in three places
   (`middleware.ts` header, `robots.txt.ts` crawl policy, `Base.astro` meta tag).
   Change all three together, and keep using `isProdRequest()` - never compare
   `Astro.url.host` directly (the node adapter reports it as `localhost`; the
   real host is in `x-forwarded-host`).

6. **Keep the `sl.js` embed.** `Base.astro` injects the StudioLayer inline-editor
   script, but only inside the preview iframe (`window.self !== window.top`).
   This powers Surfaces / inline editing. Don't remove it or load it eagerly.

## Where things live

```
src/lib/studio.ts          CMS client + cloak helpers
src/lib/host.ts            request-host resolver + prod check (indexing guard)
src/pages/cdn/[...key].ts   media proxy (cloaking + resize + cache)
src/pages/robots.txt.ts     dynamic robots.txt
src/components/CmsImage.astro  responsive cloaked <img>
src/layouts/Base.astro      head, OG tags, sl.js embed, noindex meta
src/middleware.ts           CSP frame-ancestors + X-Robots-Tag
src/styles/app.css          Tailwind 4 + @theme design tokens
server.mjs                  prod server (immutable cache on static assets)
Dockerfile                  multi-stage build
```

## Commands

```bash
npm install
npm run dev      # http://localhost:4321
npm run build
npm run start    # prod server (node server.mjs)
```

## Definition of done (before you say it's finished)

- [ ] `npm run build` passes
- [ ] No raw StudioLayer host in the rendered HTML (`curl … | grep studiolayer` = 0)
- [ ] New media renders through `/cdn/…`
- [ ] No secret value committed; new env vars added to `.env.example` + README
- [ ] Preview host still `noindex`, production host still indexable
