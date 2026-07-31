# Claude Code guide

See [AGENTS.md](./AGENTS.md) for the full rules and repo context. That file is
the single source of truth for agent conventions in this repo.

Quick reminders:

- SSR only. Server-side routes must never read from `src/` (not in the prod container).
- All CMS media goes through `/cdn/<key>` via the helpers in `src/lib/studio.ts`.
- Never commit secrets; env only (`.env` is gitignored, `.env.example` is the template).
- Keep the indexing guard intact: only the `PUBLIC_SITE_URL` host is indexable.
- Keep the `sl.js` inline-editor embed in `Base.astro`.
