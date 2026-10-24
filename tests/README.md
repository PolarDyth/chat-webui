# Tests

Run with:

```bash
npm test        # single run
npm run test:watch
```

Vitest, node environment, `@` → `src` path alias (see `vitest.config.ts`).
The suite covers the October 2026 security-audit fixes (issues #1, #2, #5–#9).

## Layout

| Folder | What lives here |
|---|---|
| `lib/` | Unit tests for `src/lib` modules — crypto (encryption at rest), stored-key read-repair, rate limiter, request validation schemas, error mapping, API error responses. Pure functions; no server. |
| `api/` | Route-handler tests. The database layer (`@/lib/db/queries`, `@/lib/auth`) is mocked; each file drives the real handler with constructed `NextRequest`s and asserts status codes, response bodies, and what was persisted. |
| `config/` | Repo-level checks — security response headers in `next.config.ts`, and env hygiene (`.env.example` present, un-ignored, documented). |

## Conventions

- Route tests name the source file: `settings-route.test.ts` tests `src/app/api/settings/route.ts`.
- Modules with import-time env caching (e.g. `src/lib/crypto.ts`) are loaded via `vi.resetModules()` + dynamic import in the crypto tests.
- The rate-limit tests use fake timers; bucket state is module-global, so tests isolate by unique IP/bucket names.
