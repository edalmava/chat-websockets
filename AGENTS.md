# AGENTS.md

## Quick start

```powershell
# Server (needs Redis at REDIS_URL in .env)
cd server
# .env vars: TURN_SECRET, TURN_URL_UDP, TURN_URL_TCP, STUN_URL, TURN_REALM, REDIS_URL
npm start   # :8443

# Chatsphere frontend
cd chatsphere
npm install
npm run dev  # :3000
```

## Architecture

```
websockets/
├── server/          # Node.js/CommonJS — WS server, auth, moderation, Redis persistence
├── chatsphere/      # React 19 + Vite 6 + TailwindCSS 4 + Zustand 5 (ESM)
├── public/          # Legacy vanilla JS (inactive)
├── logs/            # Server logs (auto-rotated JSON)
└── certs/           # Dev SSL certs (generate-certs.js)
```

## Chatsphere (active frontend)

### Key files

| File | Role |
|------|------|
| `src/config.ts` | VITE_ env vars with fallback defaults (Supabase URL/key, WS port) |
| `src/stores/useChatStore.ts` | Single Zustand store — auth, WS, P2P, navigation, media calls, notifications |
| `src/App.tsx` | Screen router via `AnimatePresence` + `getWebRTCCallbacks` bridge |
| `src/utils/wsManager.ts` | WebSocket with exponential backoff, clientId dedup, offline queue |
| `src/utils/webrtcManager.ts` | WebRTC P2P + media calls (video/voice), DataChannel signaling |
| `src/components/LlamadaOverlay.tsx` | Global overlay for video/voice calls (rendered in App.tsx) |
| `src/types.ts` | Shared types — `Screen`, `Message`, `CallType`, `CallState`, `Room` |

### Critical quirks
- **`StrictMode` disabled** in `main.tsx` — React double-mounts in dev, causing duplicate WS → reconnect loop
- **`@/` alias** points to project root (`.`), not `src/` — but codebase never uses it (all relative imports)
- **Lint**: `npm run lint` = `tsc --noEmit` only. No ESLint, no formatter
- **TailwindCSS v4**: `@import "tailwindcss"` in `index.css`, no `tailwind.config`. `@theme` directive in CSS. The `@tailwindcss/vite` plugin handles all processing.
- **Icons**: Material Symbols Outlined (Google Fonts CDN), not a React package. Use `<span className="material-symbols-outlined">icon_name</span>`.
- **Avatars**: Never external image URLs — always colored `<div>` with initials (deterministic via `getAvatarColor`)
- **Navigation**: async state change → `await` → `navigateTo`. Use `useEffect` guard for invalid states (e.g. `activeP2PUserId` null on `chat-privado` screen → fallback to `mensajes-privados`)
- **Media calls**: Signaling flows through DataChannel (not WebSocket). Call state (ringing/calling/connected) in store + webrtcManager module. The `<audio>` element in `LlamadaOverlay` is **always mounted** (not conditional) so browser autoplay policy works.
- **`CallState`**: Duplicated in `webrtcManager.ts` (module-level, includes `'ended'`) and store interface (omits `'ended'`). The store transitions: `'idle' → 'ringing' | 'calling' → 'connected' → 'idle'`.
- **Toast z-index**: `z-[100]` needed (z-50 renders behind headers). The `LlamadaOverlay` uses `z-[200]`.

### Store pattern
All WS message handling and WebRTC callback bridging lives inside the Zustand store creator as the `getWebRTCCallbacks()` function and the `procesarMensajeServidor()` switch. The store is the single source of truth for screen, auth, room, P2P, and media call state.

### `config.ts`
```typescript
export const CONFIG = Object.freeze({
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '<default>',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '<default>',
  WS_PORT: parseInt(import.meta.env.VITE_WS_PORT || '8443', 10),
});
```
Vite env vars (`VITE_*`) — chatsphere `.env` must use `VITE_` prefix.

## Server

### Key dependencies
- **Redis** (`ioredis`): Message persistence, streaming, catch-up. Required at startup (falls back to in-memory only if unavailable).
- **JWKS** (`jwks-rsa`): Token verification — **ES256 only** (HS256 support removed).
- **TURN** credentials: HMAC-SHA1 tokens, generated via `turnCredentials.js`.

### Auth flow
1. WS connects **without token in URL**
2. First message: `{ tipo: "auth", token: "<JWT>" }`
3. Server verifies via Supabase JWKS endpoint
4. Responds with `auth-info` + `salas-disponibles`
5. Heartbeat every 30s — tokens expire after 2min inactivity

### WebSocket close codes
| Code | Meaning | Client behavior |
|------|---------|-----------------|
| 4001 | Expired/invalid token | Show notification, logout |
| 4002 | Duplicate session (same user on another tab) | Show notification, logout (no reconnect) |
| 4003 | Kicked by moderator | Show notification, logout |

### Limits
- 10 fixed rooms (`SALAS_POR_DEFECTO` in `constants.js`), max 50 users/room
- Roles: `user → moderator → admin` (self-demotion blocked)
- IP rate limit: 45 connections, 15 attempts/s per IP (env-configurable)
- P2P: max 50 ICE candidates, 10 simultaneous connections, 5000 chars/message

### Common edits
- Add origin → `ALLOWED_ORIGINS` in `config/constants.js`
- Add room → `SALAS_POR_DEFECTO` in `config/constants.js`
- Dev SSL certs → `node generate-certs.js`
- `.env` gitignored — needs `TURN_SECRET`, `TURN_URL_UDP`, `TURN_URL_TCP`, `STUN_URL`, `TURN_REALM`, `REDIS_URL`

## Conventions
- **Spanish** identifiers, comments, error messages throughout
- Server: CommonJS (`type: "commonjs"`). chatsphere: ESM (`type: "module"`)
- No tests (`npm test` is a stub in both projects)
- No `alert()` / `prompt()` — toasts + custom modal (`mostrarModalInput`)
- All user input sanitized client + server via `sanitizeHtml` / `sanitizeObject`
- WebRTC signaling relay-only (no media through server)
