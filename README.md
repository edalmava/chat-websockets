# 💬 Secure Real-Time Chat & P2P (WebSocket + WebRTC)

Plataforma de comunicación en tiempo real con WebSockets para chats grupales y WebRTC para conversaciones P2P directas con cifrado de extremo a extremo.

---

## ✨ Características Principales

### 🛡️ Seguridad y Robustez
- **Validación CORS Estricta:** Control total sobre qué dominios pueden conectarse al servidor.
- **Autenticación JWT (ES256 asimétrica):** Token verificado contra Supabase JWKS. El token se envía como primer mensaje WebSocket, **no en la URL** (elimina exposición en logs y referers).
- **Protección contra XSS:** Sanitización recursiva de objetos y HTML tanto en el cliente como en el servidor.
- **Rate Limiting por usuario:** Sistema de control de inundación (spam) configurable (5 msg/s).
- **Rate Limiting por IP:** Máximo 5 conexiones simultáneas y 3 intentos/segundo por dirección IP.
- **Límite de usuarios por sala:** Máximo 50 usuarios simultáneos por sala.
- **Control de sesiones duplicadas:** Detección y cierre de sesiones simultáneas del mismo usuario.
- **Jerarquía de roles:** `user` → `moderator` → `admin` con permisos granulados para acciones de moderación.
- **Expiración activa de sesión:** Heartbeat cada 30s que desconecta tokens expirados (con margen de 2min).
- **Reconexión Inteligente:** Cliente con algoritmo de backoff exponencial para recuperar conexiones perdidas.
- **Límite de candidatos ICE:** Protección contra DoS por buffer de candidatos WebRTC (máx 50).

### 🚀 Comunicación Avanzada
- **Salas de Chat (Rooms):** Soporte nativo para 10 canales (General, Desarrollo, Soporte, Random, Gaming, Música, Cine, Deportes, Tecnología, Off-Topic).
- **WebRTC P2P Multi-chat:** Conversaciones privadas directas entre usuarios, cifradas de extremo a extremo, sin pasar mensajes de chat por el servidor.
- **Indicadores de Estado:** Sistema de "Está escribiendo..." y confirmaciones de lectura (✓✓) en chats P2P.
- **Infraestructura ICE/TURN:** Integración con servidores STUN/TURN con credenciales HMAC-SHA1 temporales (1h) y renovación automática cada 50min.

### 🏗️ Arquitectura Modular
- **`server/index.js`**: Punto de entrada con gestión de apagado limpio (Graceful Shutdown).
- **`handlers/socketHandler.js`**: Orquestador central de eventos, señalización y moderación.
- **`config/constants.js`**: Configuración centralizada de puertos, orígenes, límites y roles.
- **`middleware/authMiddleware.js`**: Verificación JWT asimétrica (ES256) contra Supabase JWKS.
- **`utils/security.js`**: CORS, sanitización HTML y sanitización recursiva de objetos.
- **`utils/validation.js`**: Validación de entrada, rate limiting por usuario y duración de mute.
- **`utils/turnCredentials.js`**: Generación de credenciales TURN con HMAC-SHA1.
- **`Logger.js`**: Motor de auditoría profesional con buffer, rotación automática (10MB), retención (30 días) y resúmenes periódicos de seguridad.

---

## 📁 Estructura del Proyecto

```text
websockets/
├── server/                   # Backend Node.js (CommonJS)
│   ├── config/
│   │   └── constants.js      # Puertos, orígenes, roles, límites
│   ├── handlers/
│   │   └── socketHandler.js  # Eventos WS: chat, salas, señalización, moderación
│   ├── middleware/
│   │   └── authMiddleware.js # Verificación JWT (ES256 vía JWKS)
│   ├── utils/
│   │   ├── security.js       # CORS, sanitizeHtml, sanitizeObject
│   │   ├── validation.js     # Validación de entrada y rate limiting
│   │   └── turnCredentials.js # Credenciales TURN HMAC-SHA1
│   ├── Logger.js             # Logging JSON con buffer y rotación
│   └── index.js              # Servidor HTTP/WS entrypoint
├── public/                   # Frontend (Vanilla JS + CSS3 + Supabase SDK)
│   ├── index.html            # Interfaz de usuario
│   ├── js/
│   │   ├── chat.js           # Orquestador central
│   │   ├── wsManager.js      # Gestor de conexión WebSocket
│   │   ├── uiManager.js      # Gestor de interfaz de usuario
│   │   ├── webrtcManager.js  # Gestor de conexiones P2P WebRTC
│   │   ├── supabaseClient.js # Wrapper de Supabase Auth
│   │   └── config.js         # Configuración del cliente Supabase
│   └── css/styles.css        # Diseño responsive
└── logs/                     # Directorio de logs (auto-generado)
```

---

## 🚀 Inicio Rápido (Desarrollo)

### 1. Requisitos Previos
- Node.js (v16+)
- Archivo `server/.env` con:
  ```env
  TURN_SECRET=tu_secret_turn
  TURN_URL_UDP=turn:turn.ejemplo.com:5349?transport=udp
  TURN_URL_TCP=turn:turn.ejemplo.com:5349?transport=tcp
  STUN_URL=stun:stun.ejemplo.com:5349
  TURN_REALM=turn.ejemplo.com
  ```
  > Nota: `SUPABASE_JWT_SECRET` ya no es necesario. La verificación de tokens usa exclusivamente JWKS asimétrica (ES256).

### 2. Instalación
```bash
cd server
npm install
```

### 3. Iniciar el Servidor
```bash
npm start
```
> El servidor inicia en `ws://localhost:8443`. No sirve archivos estáticos.

### 4. Acceder al Cliente
Abre `public/index.html` con un servidor local (Live Server en puerto 5500) cuyo origen esté en `ALLOWED_ORIGINS` de `constants.js`.

---

## 🔐 Flujo de Autenticación

1. El cliente se conecta al WebSocket **sin token en la URL**.
2. Como primer mensaje, envía `{ tipo: "auth", token: "<JWT>" }`.
3. El servidor verifica el token contra Supabase JWKS (solo ES256).
4. Si es válido, responde con `auth-info` y `salas-disponibles`.
5. El servidor monitorea expiración del token via heartbeat (cada 30s).

---

## 🛡️ Medidas de Seguridad Implementadas

| Medida | Descripción | Implementación |
|--------|-------------|----------------|
| Autenticación vía mensaje | Token JWT no viaja en query string | `wsManager.js` + `socketHandler.js` |
| Solo ES256 asimétrica | Eliminado soporte HS256 (simétrico) | `authMiddleware.js` |
| Rate limiting por IP | 5 conexiones simultáneas, 3/s | `socketHandler.js` |
| Límite de usuarios por sala | Máximo 50 por sala | `socketHandler.js` + `constants.js` |
| Límite de candidatos ICE | Máximo 50 por conexión P2P | `webrtcManager.js` |
| Chat solo en sala | Mensajes requieren join previo | `socketHandler.js` |
| Auto-degradación bloqueada | Admin no puede cambiarse rol a sí mismo | `socketHandler.js` |
| Heartbeat con expiración | Desconexión automática de tokens vencidos | `socketHandler.js` (interval 30s) |
| Sin funciones globales | Todos los event listeners via JS | `index.html` + `uiManager.js` |
| Notificaciones UI | Reemplazo de alert() nativa | `uiManager.js` + `styles.css` |

---

## 📊 Monitoreo y Auditoría

Logs estructurados (JSON) en `logs/` con:
- Intentos de conexión rechazados (CORS, IP rate limit, auth fallido)
- Violaciones de rate limit por usuario e IP
- Eventos de moderación (kick, mute, cambio de rol)
- Señalización WebRTC
- Estadísticas periódicas de usuarios activos
- Rotación automática a 10MB y retención de 30 días

---

## 📝 Roadmap

- [x] Autenticación JWT con Supabase (ES256 vía JWKS)
- [x] Rate limiting por IP y por usuario
- [x] Límite de usuarios por sala
- [x] Protección contra DoS en WebRTC (candidatos ICE)
- [x] Notificaciones UI no bloqueantes
- [ ] Persistencia de historial de mensajes públicos en base de datos
- [ ] Transferencia de archivos mediante WebRTC DataChannels
- [ ] Soporte para llamadas de audio/video P2P
- [ ] Re-validación de JWT en cada acción de moderación
- [ ] Jerarquía de roles validada en servidor para moderación

---

## 📄 Licencia y Créditos

Desarrollado con enfoque en la excelencia técnica y seguridad.
© 2026 Edalmava.
