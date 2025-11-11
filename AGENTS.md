# Repository Guidelines

## Project Structure & Modules
- Root: `index.js` (Express image proxy), `ecosystem.config.js` (PM2), `package.json`.
- Client sample: `sample/index.html`, `sample/img-optimize.js` (rewrites `<img>` `src` to proxy).
- Logs: `image-proxy.log` (Winston). Simple in‑memory cache in `index.js`.

## Build, Run, and Dev
- Install: `npm install`
- Run locally: `npm start` (starts server on port 3000)
- PM2 (cluster mode): `pm2 start ecosystem.config.js` and `pm2 logs img-optimize`
- Tip: The server currently listens on `3000` (hardcoded). Update `index.js` if you need a dynamic `PORT`.
- Sample page: open `sample/index.html`. To target local proxy, change base URL in `sample/img-optimize.js` to `http://localhost:3000/`.

## Coding Style & Naming
- JavaScript (Node 18+). ESM `import`/`export` style is used; consider adding `"type": "module"` in `package.json` if needed.
- Indentation: 2 spaces; semicolons required; single quotes.
- Naming: `camelCase` for functions/vars; `UPPER_SNAKE_CASE` for constants (e.g., `ALLOWED_PREFIXES`, `CACHE_MAX_ITEMS`).
- Logging: use the existing `winston` logger; prefer structured, concise messages.

## Testing Guidelines
- No test framework configured yet. Suggested stack: Jest + Supertest for HTTP routes.
- Test files: place alongside code or under `__tests__/`; name `*.test.js`.
- Basic coverage target: >80% for route logic and error paths.
- Run (once added): `npm test`.

## Commit & Pull Requests
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- Commits: small, focused; reference issues (e.g., `fix: handle invalid URLs (closes #12)`).
- PRs: include purpose, summary of changes, manual test notes (URLs tried, sizes), and screenshots for `sample/` changes. Ensure lint/tests pass.

## Security & Configuration
- Allowed origins live in `ALLOWED_DOMAINS` within `index.js`. Review/update before deploy.
- Proxy forwards `Referer`; validate any changes carefully.
- Cache is in‑memory (LRU‑like). Tune `CACHE_MAX_ITEMS` conservatively for your instance size.
- Avoid adding new network dependencies without justification; prefer native `fetch`/`node-fetch` + `sharp`.
