<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Dairy Farm App: rules for coding agents

- Read `docs/ROADMAP.md` and the relevant `docs/steps/` page before changing a workflow. Preserve the approved design and `docs/BRAND.md`.
- Never edit an applied migration. Add a timestamped migration, with RLS, least-privilege grants and database tests for new tables and functions. Staging demo grants must be explicit; production remains owner-only.
- Keep persisted money, balances and profit calculations in PostgreSQL. TypeScript may calculate form previews and format database results. Use one database transaction or RPC for writes that must succeed together.
- Use `todayPK()` in the browser and `farm_today()` in SQL for business dates. Do not derive the farm day with `toISOString().slice(0, 10)`. Pages that need an ID use query parameters because this app is statically exported.
- Show Roman Urdu to users, including friendly errors through `friendlyError()`. Every screen needs loading, empty and error states. Confirm permanent actions and guard against duplicate submissions.
- Use cent-based litre helpers for arithmetic and `litres()` for display. Test 360px layouts and keep important touch controls at least 44px tall.
- Keep credentials and real data out of Git. Site build values belong in each Netlify site's environment settings; see `docs/DEPLOY.md`. Never run demo/test seeds on production.
- Keep commits small. Run `npm run check` and relevant database and hosted-preview checks before opening a PR; report any device checks that remain unverified.
