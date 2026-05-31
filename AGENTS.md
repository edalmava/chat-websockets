# AGENTS.md — WebSocket Chat

## Quick start
```powershell
cd server
npm install
# .env must have TURN_SECRET + SUPABASE_JWT_SECRET (already committed, but do not commit secrets)
npm start
# Server listens on :8443, serves only WebSocket upgrade — no static files
```

Frontend: serve `public/` separately (e.g. Live Server on :5500) from an origin listed in `server/config/constants.js` (`ALLOWED_ORIGINS`).

## Architecture

| Path | Role |
|------|------|
| `server/index.js` | Entrypoint. Requires `TURN_SECRET` and `SUPABASE_JWT_SECRET` env vars or exits immediately. |
| `server/handlers/socketHandler.js` | WebSocket event orchestrator: rooms, chat, typing, WebRTC signaling, moderation. |
| `server/config/constants.js` | All magic numbers: allowed origins, room names, validation limits, role definitions. |
| `server/middleware/authMiddleware.js` | Verifies JWT via Supabase JWKS (`ES256`). Token passed as `?token=` in WS URL. |
| `server/utils/security.js` | CORS check (`isOriginAllowed`), HTML sanitization, recursive `sanitizeObject`. |
| `server/utils/validation.js` | Input validation, rate limiting (5 msg/s), role/mute duration validation. |
| `server/utils/turnCredentials.js` | TURN credentials with HMAC-SHA1 time-limited tokens. |
| `server/Logger.js` | Buffered JSON logger → `logs/` (dev) or `/var/log/websockets` (prod). 10 MB auto-rotation, 30-day retention, periodic security summaries. |
| `public/` | Vanilla HTML/CSS/JS frontend. Supabase SDK loaded from CDN. |

## Key conventions
- **Spanish codebase**: identifiers, comments, error messages, README all in Spanish.
- **CommonJS** (`type: "commonjs"` in package.json), no ESM.
- **No tests**, no linter, no formatter, no CI — `npm test` is a stub.
- **No static file server** — the HTTP server only handles WS upgrade.
- **Rooms**: fixed set of 10 rooms defined in `SALAS_POR_DEFECTO` (constants.js). `esSalaValida()` gates join requests.
- **Roles**: `user` → `moderator` → `admin` hierarchy enforced in `verificarPermiso()`.
- **Auth**: JWT from Supabase Auth, verified against Supabase JWKS endpoint. Token must be in WS connection query string.
- **Client ID**: random 9-char base-36 string generated per connection (`.id`), separate from Supabase `userId` (UUID).

## Common tasks
- Add an allowed origin → edit `ALLOWED_ORIGINS` in `server/config/constants.js`
- Add a room → edit `SALAS_POR_DEFECTO` in `server/config/constants.js`
- Generate dev SSL certs → `node generate-certs.js` (writes to `public/certs/`)
- Tweak rate limits → edit `VALIDACION` in `server/config/constants.js`

## Security notes
- `.env` is currently committed — contains real `TURN_SECRET` and `SUPABASE_JWT_SECRET`. Move to env vars or secret store for any non-local deployment.
- All user input is sanitized both client-side and server-side via `sanitizeHtml` / `sanitizeObject`.
- WebRTC signaling is relay-only (no media through server).
