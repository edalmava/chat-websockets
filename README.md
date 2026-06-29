# 💬 Secure Real-Time Chat & P2P (WebSocket + WebRTC)

Proyecto de chat en tiempo real con servidor WebSocket seguro, chat de salas públicas y chat privado P2P mediante WebRTC.

---

## ✨ Características Principales

### 🛡️ Seguridad y Control
- **Autenticación JWT** enviada como primer mensaje WebSocket (`auth`), nunca en la URL.
- **Verificación de JWKS ES256** contra Supabase, sin soporte HS256.
- **Validación de orígenes** rígida mediante `ALLOWED_ORIGINS`.
- **Control de rate limit** por IP y por usuario.
- **Límite de usuarios por sala**: 50 usuarios máximo.
- **Detección de sesión duplicada**: cierra la sesión anterior cuando un usuario se reconecta.
- **Permisos y roles**: `user`, `moderator`, `admin`.
- **Silenciamiento y expulsión** controlado por moderadores/admins.
- **Heartbeat activo** cada 30s y cierre de sesión si el JWT expira.

### 🚀 Chat y WebRTC
- **Salas públicas** con mensajes de chat agrupados por salas.
- **Chat privado P2P** usando WebRTC DataChannel.
- **Señalización WebRTC** relayed through the WebSocket server.
- **Credenciales ICE/STUN/TURN** temporales alimentadas desde el servidor.
- **Máximo 10 conexiones P2P activas** por cliente.
- **Límite de 50 candidatos ICE** por conexión peers para evitar DoS.
- **Mensajes P2P** limitados a 5000 caracteres.

### 🧩 Arquitectura del servidor
- `server/index.js` — servidor HTTP + WebSocket y cierre limpio.
- `server/handlers/socketHandler.js` — lógica de eventos, salas, moderación y WebRTC.
- `server/config/constants.js` — configuración de origen, salas, límites, roles y Redis.
- `server/middleware/authMiddleware.js` — verificación de JWT Supabase.
- `server/utils/security.js` — validación de origen y sanitización.
- `server/utils/validation.js` — validación de mensajes, roles y rate limiting.
- `server/utils/redisClient.js` — persistencia de chat en Redis Streams.
- `server/utils/turnCredentials.js` — generación de TURN HMAC-SHA1.
- `server/Logger.js` — logging estructurado con rotación.

---

## 📁 Estructura del Proyecto

```text
websockets/
├── server/                   # Backend Node.js (CommonJS)
│   ├── config/
│   │   └── constants.js      # Puertos, orígenes, roles, límites y Redis
│   ├── handlers/
│   │   └── socketHandler.js  # Eventos WS: auth, join, chat, webrtc, moderación
│   ├── middleware/
│   │   └── authMiddleware.js # Verificación JWT Supabase ES256
│   ├── utils/
│   │   ├── security.js       # CORS, sanitizeHtml, sanitizeObject
│   │   ├── validation.js     # Validación de mensajes y rate limiting
│   │   ├── redisClient.js    # Redis Streams y deduplicación
│   │   └── turnCredentials.js # Credenciales TURN HMAC-SHA1
│   ├── Logger.js             # Logging JSON con rotación y retención
│   └── index.js              # Server HTTP/WS entrypoint
├── public/                   # Frontend legacy (Vanilla JS + CSS)
│   ├── index.html            # UI de chat
│   ├── css/styles.css        # Estilos responsive
│   └── js/                   # Lógica UI, WebSocket, WebRTC, Supabase
└── chatsphere/               # Frontend React 19 + Vite + Zustand
    ├── src/                  # App React activa
    ├── package.json          # Dependencias del frontend React
    └── README.md             # README específico del cliente React
```

---

## 🚀 Inicio Rápido (Desarrollo)

### Requisitos
- Node.js 16+
- Redis disponible en `REDIS_URL` o `redis://localhost:6379`
- `server/.env` con:
  ```env
  TURN_SECRET=tu_secret_turn
  TURN_URL_UDP=turn:turn.ejemplo.com:5349?transport=udp
  TURN_URL_TCP=turn:turn.ejemplo.com:5349?transport=tcp
  STUN_URL=stun:stun.ejemplo.com:5349
  TURN_REALM=turn.ejemplo.com
  REDIS_URL=redis://localhost:6379
  ```

Opcionales:
  ```env
  IP_MAX_CONEXIONES=45
  IP_MAX_INTENTOS=15
  STREAM_MAXLEN=1000
  STREAM_MAX_AGE_HOURS=24
  CATCHUP_LIMIT=50
  PORT=8443
  ```

> La autenticación JWT se verifica contra Supabase JWKS ES256. No se usa `SUPABASE_JWT_SECRET`.

### Iniciar el servidor
```bash
cd server
npm install
npm start
```

### Iniciar el frontend React activo
```bash
cd chatsphere
npm install
npm run dev
```

### Usar el frontend legacy
- Sirve `public/index.html` desde un servidor local como Live Server o `npx serve`.
- Asegúrate de que el origen esté listado en `server/config/constants.js`.

---

## 🔧 Funcionamiento del sistema

### Backend
- Gestiona conexiones WS con `ws`.
- Valida CORS, IP rate limit y conexión de token.
- Recibe el JWT como primer mensaje `auth`.
- Emite `salas-disponibles` y `auth-info` tras auth.
- Maneja tipos: `join`, `chat`, `catch-up`, `typing`, `webrtc-signal`, `get-ice-config`, `token_refresh`, `kick_user`, `mute_user`, `cambiar_rol`.
- Persiste mensajes de sala en Redis Streams.
- Hace heartbeat de cliente y cierra si el JWT expiró.
- Renueva credenciales ICE cada 50 minutos.

### Frontend React
- React 19 + Vite + Zustand.
- Autenticación y estado de sesión.
- Navegación entre auth, lista de salas, chat de sala y chat privado.
- Reconexión con backoff exponencial.
- Notificaciones flotantes en lugar de alertas nativas.

### Frontend legacy
- Cliente vanilla JS para autenticación, salas y chat.
- Paquete simple para pruebas y demos.

---

## 🛡️ Seguridad y límites
- JWT enviado en mensaje `auth`.
- JWKS ES256 obligatorio.
- Orígenes estrictos con `ALLOWED_ORIGINS`.
- Rate limit por IP y usuario.
- Máximo 50 usuarios por sala.
- Sesión duplicada cierra la conexión anterior.
- Moderadores/admins pueden silenciar o expulsar.
- No se permite cambiar el propio rol.
- Solo usuarios en la misma sala pueden intercambiar señalización WebRTC.
- Límite de 50 candidatos ICE.
- Límite de 10 conexiones P2P activas.
- Mensajes P2P limitados a 5000 caracteres.
- Sanitización de entrada en cliente y servidor.

---

## 📦 Dependencias principales

### Servidor
- `ws`
- `dotenv`
- `jsonwebtoken`
- `jwks-rsa`
- `ioredis`

### Frontend React
- `react`
- `react-dom`
- `vite`
- `zustand`
- `@supabase/supabase-js`
- `@vitejs/plugin-react`
- `tailwindcss`

---

## 📌 Estado actual
- ✅ Backend WebSocket seguro con auth JWT.
- ✅ Chat de sala con persistencia en Redis.
- ✅ Señalización WebRTC para chat P2P.
- ✅ Roles y moderación en servidor.
- ✅ Frontend React funcional con reconexión.
- ❌ No hay persistencia de usuarios fuera de Redis.
- ❌ No hay audio/video directo; solo chat de texto P2P.

---

## 📚 Referencias clave
- `server/config/constants.js`
- `server/handlers/socketHandler.js`
- `server/middleware/authMiddleware.js`
- `server/utils/redisClient.js`
- `chatsphere/src/stores/useChatStore.ts`
- `chatsphere/src/utils/wsManager.ts`
- `chatsphere/src/utils/webrtcManager.ts`
