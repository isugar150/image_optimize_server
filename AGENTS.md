# Repository Guidelines

## Project Structure & Module Organization
- Core server entrypoint: `index.js` in the repo root (Express + Sharp + Redis).
- Environment configs: `.env`, `.env.production`, and their `*.example` templates in the root.
- PM2 config: `ecosystem.config.cjs` for production process management.
- Sample frontend: `sample/` contains browser examples calling the proxy.
- Logs: `logs/` directory is created at runtime by Winston (rotate daily).

## Build, Test, and Development Commands
- Install dependencies: `npm install` (or `npm ci` in CI/production).
- Run locally: `npm start` (`NODE_ENV=local`, uses `.env`).
- Run in production: `npm run start:prod` or `pm2 start ecosystem.config.cjs --env production`.
- There is no wired test script yet; when adding one, prefer `npm test` as a Jest entrypoint.

## Coding Style & Naming Conventions
- Language: modern Node.js with ES modules (`type: "module"`).
- Follow the existing style in `index.js`: 2-space indentation, single quotes, and descriptive constant names.
- Use lowerCamelCase for variables/functions, UPPER_SNAKE_CASE for environment-related constants, and kebab-case for new filenames.
- Keep route handlers and helpers pure and small; prefer extracting reusable logic into separate modules if the file grows large.

## Testing Guidelines
- No automated tests exist yet; if you add them, use Jest + Supertest for HTTP-level tests.
- Place tests under a `tests/` directory or alongside sources as `*.test.js`.
- Cover at least: cache HIT/MISS behavior, domain allowlist enforcement, size/time limits, and error responses.
- Ensure `npm test` runs all tests without additional flags.

## Commit & Pull Request Guidelines
- Current history uses very short, emoji-style messages; new commits should use concise, imperative subjects (e.g., `feat: add cache hit metric`).
- Group related changes into a single commit; avoid mixing refactors and behavior changes without explanation.
- Pull requests should include: purpose, key changes, how to run/verify, and any configuration/env updates.
- Add logs or screenshots only when they clarify behavior (e.g., example request/response or PM2 process output).

## Security & Configuration Tips
- Never commit real `.env` or `.env.production` files; use the `*.example` templates instead.
- Keep `ALLOWED_DOMAINS` restrictive and updated when adding new origins.
- Be careful when adjusting limits such as `ORIGIN_MAX_BYTES` and `SHARP_MAX_PIXELS`; document any changes in the PR description.

## Agent-Specific Instructions
- When editing, keep changes minimal and consistent with existing patterns in `index.js` and `README.md`.
- Prefer small, focused PRs and avoid introducing new build tools or frameworks unless explicitly requested.
