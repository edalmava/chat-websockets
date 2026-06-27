# AGENTS.md

## Quick start

```powershell
# Server (WS-only, no static files)
cd server
# .env needs TURN_SECRET, TURN_URL_UDP, TURN_URL_TCP, STUN_URL, TURN_REALM
npm start   # :8443

# Chatsphere frontend (React)
cd chatsphere
npm install
npm run dev  # :3000

# OR old vanilla frontend (public/)
# Serve with Live Server on :5500 — origin must be in ALLOWED_ORIGINS
```

## Architecture

```
websockets/
├── server/          # Node.js/CommonJS backend — WS server, auth, moderation
├── chatsphere/      # React 19 + Vite + TailwindCSS 4 + Zustand frontend
├── public/          # Legacy vanilla JS frontend (no longer active)
├── logs/            # Server logs (auto-rotated JSON)
└── certs/           # Dev SSL certs (generate-certs.js)
```

## chatsphere (the active frontend)

| File | Role |
|------|------|
| `src/stores/useChatStore.ts` | Zustand store — all state & actions (auth, WS, P2P, navigation, notifications) |
| `src/App.tsx` | Screen router via `AnimatePresence` + `currentScreen` state |
| `src/components/Auth.tsx` | Login/Register via Supabase |
| `src/components/MensajesPrivados.tsx` | P2P thread list + room users as "stories" |
| `src/components/ChatPrivado.tsx` | P2P chat view with WebRTC status |
| `src/components/ChatSala.tsx` | Public room chat |
| `src/components/ListaSalas.tsx` | Room list |
| `src/utils/wsManager.ts` | WebSocket connection (exponential backoff) |
| `src/utils/webrtcManager.ts` | WebRTC P2P with ICE/connection limits |
| `src/utils/supabaseClient.ts` | Supabase auth wrapper |
| `src/types.ts` | `Screen`, `Message`, `ChatThread`, `Room`, `RoomUser` |

### Key quirks
- **`StrictMode` disabled** in `main.tsx` — React double-mounts in dev, causing duplicate WS connections → server closes first connection → reconnect loop
- **`@/` path alias** points to project root (`.`), not `src/` — but the codebase never uses it (all imports are relative)
- **Lint**: `npm run lint` = `tsc --noEmit` only. No ESLint, no formatter, no CI
- **Dev server**: `vite --port=3000 --host=0.0.0.0`, HMR disabled via `DISABLE_HMR` env var (AI Studio)
- **Icons**: Material Symbols Outlined (loaded from Google Fonts CDN), not a React package
- **Avatars**: Never external image URLs — always colored `<div>` with initials via `getAvatarColor(name)` (deterministic color from name hash)
- **Toast z-index**: `z-[100]` needed (z-50 renders behind headers)
- **Navigation pattern**: async state change → `await` → `navigateTo`, never in reverse. Use `useEffect` fallback guard for invalid states (e.g. `activeP2PUserId` null but on chat-privado screen)
- **P2P disconnect**: `terminarP2PChat` action in store closes WebRTC, removes thread, navigates back — paired with `link_off` icon button in `ChatPrivado` header

## Server

| File | Role |
|------|------|
| `index.js` | HTTP server + WS upgrade, graceful shutdown |
| `handlers/socketHandler.js` | WS events: rooms, chat, typing, WebRTC signaling, moderation, IP rate limit |
| `config/constants.js` | Allowed origins, rooms, limits, roles |
| `middleware/authMiddleware.js` | JWT via Supabase JWKS (ES256 only — no HS256) |
| `utils/security.js` | `isOriginAllowed`, `sanitizeHtml`, `sanitizeObject` |
| `utils/validation.js` | Rate limiting (5 msg/s), role/mute validation |
| `utils/turnCredentials.js` | HMAC-SHA1 TURN tokens |
| `Logger.js` | Buffered JSON logger, 10 MB rotation, 30-day retention |

### Auth flow
1. WS connects **without token in URL**
2. First message: `{ tipo: "auth", token: "<JWT>" }`
3. Server verifies via Supabase JWKS endpoint (ES256 only)
4. Responds with `auth-info` + `salas-disponibles`
5. Heartbeat every 30s — tokens expire after 2min inactivity

### Limits (server-side)
- Rooms: 10 fixed (`SALAS_POR_DEFECTO`), max 50 users/room
- Roles: `user` → `moderator` → `admin` (self-demotion blocked)
- IP rate limit: max 45 connections, 15 attempts/s per IP (configurable via env)
- P2P: max 50 ICE candidates, 10 simultaneous connections, 5000 chars per message

### Common edits
- Add origin → `ALLOWED_ORIGINS` in `constants.js`
- Add room → `SALAS_POR_DEFECTO` in `constants.js`
- Dev SSL certs → `node generate-certs.js`
- `.env` gitignored — contains `TURN_SECRET`

## Conventions
- Spanish identifiers, comments, error messages throughout
- Server: CommonJS (`type: "commonjs"`). chatsphere: ESM (`type: "module"`)
- No tests (`npm test` is a stub in both projects)
- No `alert()` / `prompt()` — toasts + custom modal (`mostrarModalInput`)
- All user input sanitized both client + server via `sanitizeHtml` / `sanitizeObject`
- Inline event handlers banned — all listeners via JS (`uiManager.js` or React)
- WebRTC signaling relay-only (no media through server)
