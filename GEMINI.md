# 🚀 Contexto de Desarrollo - WebSocket Chat

Archivo auxiliar con contexto para asistentes AI. Ver `AGENTS.md` para documentación operativa y `README.md` para documentación funcional.

## 🏗️ Arquitectura

1. **Cliente** (`public/js/`): Módulos ES6 — `chat.js` orquestador, `wsManager.js` conexión WS con backoff exponencial, `uiManager.js` manipulación DOM, `webrtcManager.js` gestión P2P con límites ICE y de conexiones.
2. **Servidor** (`server/`): CommonJS. `index.js` entrypoint, `socketHandler.js` eventos WS, `authMiddleware.js` verificación JWT ES256 vía JWKS, `validation.js` sanitización y rate limiting.
3. **Seguridad**: Sanitización XSS bidireccional, IP rate limiting configurable vía env (`IP_MAX_CONEXIONES`, `IP_MAX_INTENTOS`), sin `alert()`/`prompt()` en cliente.

## ⚠️ Convenciones

- Spanish identifiers, CommonJS server-side, ES modules client-side
- No static file server — solo WebSocket upgrade
- No tests, linter ni CI
