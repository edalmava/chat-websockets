# 💬 Chat en Tiempo Real - WebSocket

Una aplicación de chat segura y escalable usando **Node.js**, **WebSocket (WSS)** y **HTTPS**, lista para producción en cualquier VPS.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)
![Node Version](https://img.shields.io/badge/node-14+-green)

---

## ✨ Características Principales

### 🔒 Seguridad Avanzada
- ✅ **HTTPS/WSS (WebSocket Seguro)** - Encriptación en tránsito
- ✅ **Validación CORS** - Solo orígenes permitidos pueden conectarse
- ✅ **Sanitización XSS** - Prevención de inyección de código HTML/JavaScript
- ✅ **Rate Limiting** - Control de spam (5 mensajes por segundo)
- ✅ **Validación de Entrada** - Límites de caracteres y restricciones

### ⚡ Rendimiento
- ✅ **WebSocket Nativo** - Conexión bidireccional en tiempo real
- ✅ **Múltiples Usuarios Simultáneos** - Escalable y eficiente
- ✅ **Logging Estructurado** - Seguimiento de eventos y errores
- ✅ **Bajo Latency** - Respuestas instantáneas

### 🌐 Compatibilidad
- ✅ **Modo Desarrollo** - Soporte para localhost + Live Server
- ✅ **Modo Producción** - Deployment en VPS con Apache 2
- ✅ **Auto-Renovación de Certificados** - Let's Encrypt integrado
- ✅ **Cross-Browser** - Compatible con todos los navegadores modernos

### 👥 Funcionalidades
- ✅ **Lista de Usuarios Conectados** - Actualización en tiempo real
- ✅ **Mensajes Instantáneos** - Broadcast a todos los usuarios
- ✅ **Interfaz Responsiva** - Funciona en desktop y móvil
- ✅ **Notificaciones de Estados** - Conexión/desconexión de usuarios

---

## 🚀 Inicio Rápido

### **Instalación Local (5 minutos)**

```bash
# 1. Clonar el repositorio
git clone <repo-url> websockets
cd websockets

# 2. Instalar dependencias
cd server
npm install ws

# 3. Generar certificados autofirmados (desarrollo)
node ../generate-certs.js

# 4. Iniciar servidor
node index.js
# Output: Servidor WebSocket escuchando en wss://localhost:8443

# 5. Abrir navegador
# Usa Live Server en VS Code o abre index.html directamente
```

### **Deployment en VPS (20 minutos)**

La instalación completa en VPS está automatizada:

```bash
chmod +x deploy.sh
sudo bash deploy.sh
```

O sigue los pasos manuales en [QUICK-START-VPS.md](QUICK-START-VPS.md)

---

## 📁 Estructura del Proyecto

```
websockets/
├── server/
│   ├── index.js          # Servidor WebSocket con HTTPS
│   ├── Logger.js         # Sistema de logging
│   └── package.json      # Dependencias
├── js/
│   └── chat.js          # Cliente WebSocket
├── css/
│   └── styles.css       # Estilos de la interfaz
├── certs/               # Certificados SSL/TLS
├── index.html           # Página principal
├── generate-certs.js    # Generador de certificados
├── deploy.sh            # Script de deployment automático
└── README.md            # Esta documentación
```

---

## 🔧 Configuración

### **Cliente (js/chat.js)**
```javascript
// Cambiar URL de servidor
const socket = new WebSocket('wss://tu-dominio.com');
```

### **Servidor (server/index.js)**
```javascript
// Agregar tu dominio a orígenes permitidos
const ALLOWED_ORIGINS = [
    'https://tu-dominio.com',
    'https://www.tu-dominio.com'
];
```

### **Límites y Validación**
```javascript
const VALIDACIÓN = {
    USERNAME_MIN: 1,          // Mínimo caracteres de nombre
    USERNAME_MAX: 50,         // Máximo caracteres de nombre
    MESSAGE_MIN: 1,           // Mínimo caracteres de mensaje
    MESSAGE_MAX: 500,         // Máximo caracteres de mensaje
    RATE_LIMIT_MESSAGES: 5,   // Mensajes por ventana
    RATE_LIMIT_WINDOW: 1000   // Ventana en milisegundos
};
```

---

## 📊 Arquitectura

```
┌─────────────────────┐
│   Navegador Web     │
│   (Cualquier lugar) │
└──────────┬──────────┘
           │ HTTPS + WSS (Puerto 443)
           ▼
┌─────────────────────┐
│    Apache 2         │
│  (Proxy Reverso)    │
└──────────┬──────────┘
           │ WSS (Puerto 8443, local)
           ▼
┌─────────────────────┐
│   Node.js Server    │
│   WebSocket (WSS)   │
└─────────────────────┘
```

---

## 🔐 Medidas de Seguridad

| Seguridad | Implementación |
|-----------|---|
| **Encriptación** | HTTPS/WSS (TLS 1.2+) |
| **CORS** | Whitelist de orígenes |
| **XSS** | Sanitización HTML  |
| **Input** | Validación y límites |
| **DDoS** | Rate limiting |
| **SSL/TLS** | Let's Encrypt automático |

---

## 📝 Comandos Útiles

### **Desarrollo**
```bash
# Iniciar servidor
node server/index.js

# Ver logs en tiempo real
tail -f logs/chat.log

# Reiniciar con PM2
pm2 restart chat

# Monitorear recursos
pm2 monit
```

### **Certificados**
```bash
# Generar certificados autofirmados
node generate-certs.js

# Verificar certificado Let's Encrypt
sudo certbot certificates

# Renovar certificado
sudo certbot renew --force-renewal
sudo systemctl restart apache2
```

### **Apache**
```bash
# Verificar configuración
sudo apache2ctl configtest

# Reiniciar Apache
sudo systemctl restart apache2

# Ver virtual hosts
sudo apache2ctl -D DUMP_VHOSTS

# Ver logs
sudo tail -f /var/log/apache2/error.log
```

---

## 🧪 Testing

### **Test Local**
```bash
# 1. Abre múltiples pestañas del navegador
# 2. Escribe un nombre de usuario
# 3. Envía mensajes entre pestañas
# 4. Verifica que los usuarios aparecen en tiempo real
```

### **Test de Conexión**
```bash
# Test HTTP a HTTPS
curl -I https://tu-dominio.com

# Test WebSocket
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  https://tu-dominio.com
```

### **Verificar DevTools**
- Abre DevTools (F12)
- Ve a **Network** → **WS** (WebSocket)
- Deberías ver conexión `wss://` (no `ws://`)
- Si ves 🔒 en la URL, HTTPS está activo

---

## ❌ Solución de Problemas

### **"Connection refused"**
```bash
# Verifica que el servidor está corriendo
sudo pm2 logs chat

# Reinicia el servidor
sudo pm2 restart chat
```

### **"403 Forbidden / CORS Error"**
```bash
# Verifica permisos de carpeta
sudo chown -R www-data:www-data /var/www/websockets

# Actualiza ALLOWED_ORIGINS en server/index.js
```

### **"Certificado no válido"**
```bash
# Renovar certificado Let's Encrypt
sudo certbot renew --force-renewal
sudo systemctl restart apache2
```

### **"WebSocket connection failed"**
- Verifica que dominio en cliente = ALLOWED_ORIGINS
- Comprueba que Apache proxy_wstunnel está habilitado
- Revisa logs: `sudo tail -f /var/log/apache2/error.log`

---

## 📊 Requisitos

### **Desarrollo**
- Node.js 14+
- npm 6+
- Navegador moderno con WebSocket

### **Producción**
- VPS con Debian/Ubuntu
- Apache 2.4+
- Node.js 14+
- PM2 (gestor de procesos)
- Let's Encrypt / Certbot

---

## 📚 Documentación Adicional

- 📖 [QUICK-START-VPS.md](QUICK-START-VPS.md) - Guía rápida de deployment
- 🔒 [README-SEGURIDAD.md](README-SEGURIDAD.md) - Medidas de seguridad detalladas
- 📋 [IMPLEMENTACION-COMPLETA.md](IMPLEMENTACION-COMPLETA.md) - Implementación paso a paso
- 🌍 [DEPLOYMENT-VPS-DEBIAN.md](DEPLOYMENT-VPS-DEBIAN.md) - Deployment en VPS Debian

---

## 📄 Licencia

ISC © Edalmava

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/mejora`)
3. Commit cambios (`git commit -am 'Agrega mejora'`)
4. Push a la rama (`git push origin feature/mejora`)
5. Abre un Pull Request

---

## 💡 Roadmap

- [ ] Autenticación con JWT
- [ ] Persistencia de mensajes (Base de datos)
- [ ] Rooms/Canales privados
- [ ] Emojis y multimedia
- [ ] Sistema de menciones
- [ ] Historial de mensajes
- [ ] API REST adicional
- [ ] Dashboard de administración

---

## 📞 Soporte

Para nuevas características o reportar bugs, abre un issue en el repositorio.

---

**⭐ Si te gusta el proyecto, ¡dale una estrella!**

Hecho con ❤️ para la comunidad de desarrolladores.
