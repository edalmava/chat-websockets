# Servidor WebSocket de Chat en Tiempo Real

Este directorio contiene el backend Node.js que gestiona la conexión WebSocket, la autenticación JWT, las salas de chat y la señalización WebRTC.

## Qué hace

- Recibe conexiones WebSocket seguras con `ws`.
- Verifica JWT de Supabase mediante JWKS ES256.
- Controla CORS usando `ALLOWED_ORIGINS`.
- Implementa rate limiting por IP y por usuario.
- Funciona con salas públicas de chat y persiste mensajes en Redis Streams.
- Emite credenciales STUN/TURN temporales para WebRTC.
- Gestiona roles y moderación: kick, mute y cambio de rol.
- Mantiene un heartbeat que cierra sesiones con tokens expirados.
- Genera logs estructurados en `logs/` con rotación.

## Estructura principal

- `index.js` — arranque del servidor HTTP/WebSocket y cierre limpio.
- `config/constants.js` — puertos, límites, orígenes, salas, roles y configuración Redis.
- `handlers/socketHandler.js` — lógica principal de eventos WS y moderación.
- `middleware/authMiddleware.js` — verificación de JWT Supabase.
- `utils/security.js` — validar origen y sanitizar entradas.
- `utils/validation.js` — validación de mensajes, roles y rate limiting.
- `utils/redisClient.js` — persistencia de chat en Redis Streams.
- `utils/turnCredentials.js` — construcción de credenciales TURN HMAC-SHA1.
- `Logger.js` — logging JSON con rotación de archivos.

## Requisitos

- Node.js 16+
- Redis accesible en `REDIS_URL` (por defecto `redis://localhost:6379`)
- Variables de entorno en `server/.env`

## Variables de entorno

Crea un archivo `server/.env` con al menos:

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

> Nota: la verificación de JWT usa exclusivamente JWKS ES256 contra Supabase. No se utiliza `SUPABASE_JWT_SECRET`.

## Instalación y ejecución

```bash
cd server
npm install
npm start
```

El servidor se inicia por defecto en `ws://localhost:8443`.

## Lógica de mensajes soportados

El servidor maneja los siguientes tipos de mensaje:

- `auth` — autenticación inicial con token JWT.
- `join` — unirse a una sala.
- `chat` — enviar mensaje a sala.
- `catch-up` — solicitar historial de mensajes.
- `typing` — indicar estado de escritura en sala.
- `webrtc-signal` — retransmitir señalización WebRTC.
- `get-ice-config` — pedir credenciales STUN/TURN.
- `token_refresh` — validar y actualizar token en la misma sesión.
- `kick_user` — expulsar usuario (moderador/admin).
- `mute_user` — silenciar usuario (moderador/admin).
- `cambiar_rol` — cambiar rol de usuario (admin).

## Dependencias principales

- `ws`
- `dotenv`
- `jsonwebtoken`
- `jwks-rsa`
- `ioredis`

## Notas

- El servidor sólo proporciona WebSocket y no sirve archivos estáticos.
- Para usar el frontend React, el origen de `localhost:3000` debe estar incluido en `server/config/constants.js`.
- Los mensajes de chat se guardan en Redis con deduplicación basada en offsets de cliente.
- El servidor cierra la conexión anterior si un mismo usuario se conecta desde otra ubicación.
