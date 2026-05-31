# 🚀 Contexto de Desarrollo - WebSocket Chat

Este archivo proporciona instrucciones y contexto para el desarrollo, mantenimiento y despliegue del proyecto de Chat en Tiempo Real.

## 📝 Resumen del Proyecto
Una aplicación de chat segura y escalable basada en **Node.js** y **WebSockets (WSS)**, diseñada con un fuerte enfoque en seguridad y monitoreo.

### Tecnologías Principales
- **Servidor:** Node.js, `ws` (WebSocket)
- **Cliente:** HTML5, CSS3, Vanilla JavaScript
- **Seguridad:** HTTPS/WSS, Sanitización XSS, Validación CORS, Rate Limiting
- **Monitoreo:** Sistema de logging profesional con rotación automática de archivos JSON

## 🛠️ Comandos Esenciales

### Instalación y Desarrollo Local
```powershell
# 1. Instalar dependencias del servidor
cd server
npm install

# 2. Generar certificados autofirmados para WSS local
node ../generate-certs.js

# 3. Iniciar el servidor
node index.js
```

### Monitoreo y Logs
- Los logs se guardan en `logs/` (desarrollo) o `/var/log/websockets` (producción).
- El sistema realiza rotación automática cuando los archivos superan los 10MB.
- Se mantiene un historial de 30 días de logs.

## 🏗️ Arquitectura y Flujo
1. **Cliente (`public/js/chat.js`):** Gestiona la conexión, salas, UI y sanitización inicial.
2. **Servidor (`server/`):**
   - `index.js`: Inicialización y apagado limpio.
   - `handlers/socketHandler.js`: Lógica central de WebSockets y gestión de **Salas (Rooms)**.
   - `config/constants.js`: Configuración centralizada (Puertos, CORS, Salas).
   - `utils/`: Validaciones de seguridad y sanitización.
3. **Seguridad (`server/Logger.js`):** Registra eventos y auditorías de seguridad.

## ⚠️ Convenciones y Reglas de Desarrollo

### 1. Seguridad (Prioridad Alta)
- **Sanitización:** Siempre sanitizar el contenido tanto en cliente como en servidor. No confiar nunca en la entrada del usuario.
- **CORS:** Si se añade un nuevo dominio de prueba, debe registrarse en la constante `ALLOWED_ORIGINS` dentro de `server/config/constants.js`.

### 2. Estructura de Archivos
- `server/`: Lógica del backend dividida en `handlers/`, `config/` y `utils/`.
- `public/js/`: Lógica del cliente WebSocket.
- `public/css/`: Estilos visuales.
- `certs/`: Certificados SSL/TLS (no subir certificados reales al repo).

### 3. Manejo de Errores
- Utilizar el `logger.log()` para cualquier evento significativo.
- Los errores críticos en el servidor deben notificarse al cliente afectado mediante la función `enviarError()`.

## 🚀 Despliegue (VPS)
El proyecto incluye un script de despliegue automatizado `deploy.sh` diseñado para entornos Debian/Ubuntu con Apache 2 como Proxy Reverso.

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

## 📅 Roadmap / Tareas Pendientes
- [x] Implementar "Rooms" o canales privados.
- [ ] Implementar autenticación JWT.
- [ ] Persistencia de mensajes en base de datos.
