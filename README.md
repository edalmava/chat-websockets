# 💬 Secure Real-Time Chat (WebSocket + Node.js)

Una aplicación de chat en tiempo real diseñada con un enfoque prioritario en la **seguridad**, la **modularidad** y el **monitoreo profesional**. Ideal como base para sistemas de comunicación seguros o para aprender implementaciones avanzadas de WebSockets (WSS).

---

## ✨ Características Principales

### 🛡️ Seguridad de Nivel Producción
- **WSS (WebSocket Secure):** Comunicación encriptada mediante TLS/SSL.
- **Validación CORS Estricta:** Solo orígenes autorizados pueden establecer conexión.
- **Protección contra XSS:** Sanitización exhaustiva de mensajes y nombres de usuario tanto en cliente como en servidor.
- **Rate Limiting:** Control de frecuencia para prevenir ataques de denegación de servicio (DoS) o spam (5 mensajes/segundo).
- **Handshake de Identificación:** Protocolo de unión explícito antes de permitir el intercambio de mensajes.

### 🏗️ Arquitectura Modular
El backend ha sido desacoplado en módulos especializados para facilitar su mantenimiento y escalabilidad:
- **`config/`**: Gestión centralizada de constantes y variables de entorno.
- **`utils/`**: Funciones reutilizables de seguridad y validación.
- **`handlers/`**: Lógica de eventos de red separada de la inicialización del servidor.

### 📊 Monitoreo y Auditoría
- **Sistema de Logging Profesional:** Registro de eventos en formato JSON.
- **Rotación Automática:** Los archivos de log rotan al alcanzar los 10MB para optimizar el almacenamiento.
- **Auditoría de Seguridad:** Seguimiento detallado de rechazos por CORS y violaciones de rate limit.

---

## 📁 Estructura del Proyecto

```text
websockets/
├── server/                 # Lógica del Backend (Node.js)
│   ├── config/             # Constantes y parámetros
│   ├── handlers/           # Lógica de WebSockets
│   ├── utils/              # Seguridad y Validaciones
│   ├── Logger.js           # Motor de logging JSON
│   └── index.js            # Punto de entrada
├── public/                 # Frontend (Cliente)
│   ├── index.html          # Interfaz de usuario
│   ├── js/chat.js          # Lógica del cliente
│   └── css/styles.css      # Estilos visuales
└── deploy.sh               # Script de despliegue para VPS
```

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Clonar e Instalar
```bash
git clone <repo-url> websockets
cd websockets/server
npm install ws
```

### 2. Generar Certificados SSL
Para habilitar WSS localmente, genera tus certificados auto-firmados:
```bash
cd ..
node generate-certs.js
```

### 3. Iniciar el Servidor
```bash
cd server
npm start
```
> El servidor escuchará en `wss://localhost:8443` por defecto.

### 4. Acceder al Chat
Abre `public/index.html` en tu navegador (se recomienda usar un servidor local como **Live Server** de VS Code para que coincidan los orígenes CORS configurados).

---

## 🛠️ Configuración (CORS)

Para añadir nuevos orígenes permitidos, edita `server/config/constants.js`:

```javascript
const ALLOWED_ORIGINS = [
    'http://localhost:5500',
    'https://tu-dominio.com'
];
```

---

## 📝 Roadmap

- [ ] Implementar autenticación mediante JWT.
- [ ] Persistencia de mensajes en base de datos (MongoDB/PostgreSQL).
- [ ] Soporte para salas de chat privadas y canales.
- [ ] Interfaz para compartir archivos y multimedia.

---

## 📄 Licencia

Hecho con amor por
© 2026 Edalmava.
