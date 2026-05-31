# AGENTS.md — WebSocket Chat

## Quick start
```powershell
cd server
npm install
# .env must have TURN_SECRET, TURN_URL_UDP, TURN_URL_TCP, STUN_URL, TURN_REALM
npm start
# Server listens on :8443, serves only WebSocket upgrade — no static files
```

Frontend: serve `public/` separately (e.g. Live Server on :5500) from an origin listed in `server/config/constants.js` (`ALLOWED_ORIGINS`).

## Architecture

| Path | Role |
|------|------|
| `server/index.js` | Entrypoint. Sets up HTTP server, attaches WS, auth middleware, heartbeat (30s). |
| `server/handlers/socketHandler.js` | WebSocket event orchestrator: rooms, chat, typing, WebRTC signaling, moderation, IP rate limiting, session dedup. |
| `server/config/constants.js` | All magic numbers: allowed origins, room names, validation limits, role definitions, ICE cap, IP rate limits. |
| `server/middleware/authMiddleware.js` | Verifies JWT via Supabase JWKS (`ES256` only — no HS256). Token received as first WS message, **not** query string. |
| `server/utils/security.js` | CORS check (`isOriginAllowed`), HTML sanitization, recursive `sanitizeObject`. |
| `server/utils/validation.js` | Input validation, rate limiting (5 msg/s), role/mute duration validation. |
| `server/utils/turnCredentials.js` | TURN credentials with HMAC-SHA1 time-limited tokens. |
| `server/Logger.js` | Buffered JSON logger → `logs/` (dev) or `/var/log/websockets` (prod). 10 MB auto-rotation, 30-day retention, periodic security summaries. |
| `public/` | Vanilla HTML/CSS/JS frontend. Supabase SDK loaded from CDN. |
| `public/js/wsManager.js` | WebSocket connection manager with exponential backoff reconnection. |
| `public/js/chat.js` | Central client orchestrator: connects wsManager + uiManager + webrtcManager. |
| `public/js/uiManager.js` | DOM manipulation, toast notifications, auth forms, admin panel. No `window.*` exports. |
| `public/js/webrtcManager.js` | WebRTC peer connection management, ICE candidate limiting (max 50). |
| `public/js/supabaseClient.js` | Supabase auth wrapper (login, register, logout, session). |
| `public/js/config.js` | Client-side config (Supabase anon key, API URL). |

## Key conventions
- **Spanish codebase**: identifiers, comments, error messages, README all in Spanish.
- **CommonJS** (`type: "commonjs"` in package.json), no ESM.
- **No tests**, no linter, no formatter, no CI — `npm test` is a stub.
- **No static file server** — the HTTP server only handles WS upgrade.
- **Rooms**: fixed set of 10 rooms defined in `SALAS_POR_DEFECTO` (constants.js). `esSalaValida()` gates join requests. Max 50 users per room.
- **Roles**: `user` → `moderator` → `admin` hierarchy enforced in `verificarPermiso()`. Self-demotion blocked server-side.
- **Auth**: JWT from Supabase Auth, verified against Supabase JWKS endpoint via **ES256 only**. Token sent as **first WS message**, not in URL.
- **Client ID**: random 9-char base-36 string generated per connection (`.id`), separate from Supabase `userId` (UUID).
- **IP Rate Limiting** (in-memory): max 5 concurrent connections and 3 attempts/s per IP.
- **ICE Candidate Limit**: max 50 candidates per P2P connection (dropped before `remoteDescription` to avoid DoS).

## Common tasks
- Add an allowed origin → edit `ALLOWED_ORIGINS` in `server/config/constants.js`
- Add a room → edit `SALAS_POR_DEFECTO` in `server/config/constants.js`
- Generate dev SSL certs → `node generate-certs.js` (writes to `public/certs/`)
- Tweak rate limits → edit `VALIDACION` in `server/config/constants.js` or `IP_RATE_LIMIT` section
- Tweak ICE limit → edit `MAX_ICE_CANDIDATES` in `constants.js` (currently 50)

## Security notes
- `.env` is currently committed — contains real `TURN_SECRET`. Move to env vars or secret store for any non-local deployment.
- `SUPABASE_JWT_SECRET` env var was removed — auth uses asymmetric JWKS only.
- All user input is sanitized both client-side and server-side via `sanitizeHtml` / `sanitizeObject`.
- WebRTC signaling is relay-only (no media through server).
- No inline event handlers in HTML — all listeners attached via JS in uiManager.js.
- No `alert()` calls in client code — all notifications via toast UI.
