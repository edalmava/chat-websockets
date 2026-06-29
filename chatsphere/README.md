# ChatSphere React Frontend

Frontend React de la aplicación de chat en tiempo real. Usa React 19, Vite y Zustand para manejar la sesión, la navegación entre pantallas y el chat en sala / chat privado P2P.

## Qué incluye

- Autenticación con Supabase Auth (email + contraseña)
- Conexión WebSocket segura a un servidor backend separado
- Mensajería de sala pública con redis-backed chat history
- Chat privado peer-to-peer (P2P) con WebRTC DataChannel
- Reconexión automática con backoff exponencial
- Cola offline en `localStorage` para reintentar envíos si el socket está desconectado
- Roles de usuario y herramientas de moderación

## Estructura principal

- `src/App.tsx` — ruteo de pantallas y animaciones de transición
- `src/stores/useChatStore.ts` — estado global con Zustand y lógica de negocio
- `src/utils/wsManager.ts` — manager de WebSocket con auth por mensaje, acknowledgements y cola offline
- `src/utils/webrtcManager.ts` — WebRTC P2P, manejo de ofertas/answers/candidatos y mensajes de DataChannel
- `src/utils/supabaseClient.ts` — wrapper de Supabase Auth
- `src/config.ts` — configuración runtime del cliente

## Variables de entorno

Este frontend usa variables de Vite.

Crea un archivo `.env` o `.env.local` en `chatsphere/` con:

```env
VITE_SUPABASE_URL=https://mhlkaqlfoeebwztlldgu.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_bOb_T2mYvKDJCGu2uGmVeA_KXTSG6s1
VITE_WS_PORT=8443
```

> Nota: El servidor WebSocket se espera en `ws://localhost:8443` durante el desarrollo.

## Inicio rápido

```bash
cd chatsphere
npm install
npm run dev
```

Luego abre `http://localhost:3000`.

## Cómo funciona

### Autenticación
- El usuario inicia sesión o se registra con Supabase Auth.
- El token JWT de Supabase se envía al servidor WebSocket en el primer mensaje `auth`.

### WebSocket
- `src/utils/wsManager.ts` crea la conexión WS y mantiene un reintento exponencial.
- El token no se incluye en la URL.
- El cliente gestiona `ack` de mensajes con `requestId`.
- Si el socket está desconectado, los mensajes de tipo `chat` se encolan en `localStorage`.

### WebRTC P2P
- `src/utils/webrtcManager.ts` gestiona `RTCPeerConnection`, canales de datos y buffer de candidatos.
- El chat privado se intercambia directamente por DataChannel.
- El cliente limita el tamaño de mensajes y notifica escritura/lectura.

### Estado y navegación
- `useChatStore.ts` controla:
  - sesión de usuario
  - salas disponibles
  - mensajes de sala
  - usuarios de sala
  - hilos P2P
  - estado de conexión y notificaciones

## Dependencias principales

- `react`
- `react-dom`
- `vite`
- `zustand`
- `@supabase/supabase-js`
- `@vitejs/plugin-react`
- `tailwindcss`

## Notas

- Este frontend es el cliente React activo del proyecto.
- No se sirve estáticamente desde el backend WebSocket.
- Para que funcione, el backend WebSocket debe estar en ejecución y `ALLOWED_ORIGINS` debe incluir el origen de `localhost:3000`.
