# 💬 Secure Real-Time Chat & P2P (WebSocket + WebRTC)

Una plataforma de comunicación en tiempo real de alto rendimiento diseñada con un enfoque prioritario en la **seguridad**, la **modularidad** y la **privacidad**. Este proyecto combina la velocidad de los WebSockets para chats grupales con la privacidad de WebRTC para conversaciones P2P (Peer-to-Peer) directas.

---

## ✨ Características Principales

### 🛡️ Seguridad y Robustez
- **Validación CORS Estricta:** Control total sobre qué dominios pueden conectarse al servidor.
- **Protección contra XSS:** Sanitización recursiva de objetos y HTML tanto en el cliente como en el servidor.
- **Rate Limiting:** Sistema de control de inundación (spam) configurable por usuario.
- **Gestión de Sesiones:** Handshake de identificación obligatoria y control de nombres duplicados.
- **Reconexión Inteligente:** Cliente con algoritmo de backoff exponencial para recuperar conexiones perdidas.

### 🚀 Comunicación Avanzada
- **Salas de Chat (Rooms):** Soporte nativo para múltiples canales (General, Desarrollo, Soporte, Random).
- **WebRTC P2P Multi-chat:** Conversaciones privadas directas entre usuarios, cifradas de extremo a extremo, sin pasar mensajes de chat por el servidor.
- **Indicadores de Estado:** Sistema de "Está escribiendo..." y confirmaciones de lectura (✓✓) en chats P2P.
- **Infraestructura ICE/TURN:** Integración con servidores STUN/TURN para garantizar conectividad P2P incluso tras NATs restrictivos.

### 🏗️ Arquitectura Modular (Clean Code)
El backend está organizado para facilitar la mantenibilidad:
- **`server/index.js`**: Punto de entrada con gestión de apagado limpio (Graceful Shutdown).
- **`handlers/socketHandler.js`**: Orquestador central de eventos y señalización.
- **`config/constants.js`**: Configuración centralizada de puertos, orígenes y límites.
- **`Logger.js`**: Motor de auditoría profesional con rotación automática y formato JSON.

---

## 📁 Estructura del Proyecto

```text
websockets/
├── server/                 # Backend Node.js
│   ├── config/             # Configuración y constantes
│   ├── handlers/           # Lógica de WebSockets y Señalización
│   ├── utils/              # Seguridad, Validaciones y TURN
│   ├── Logger.js           # Sistema de logs JSON
│   └── index.js            # Servidor HTTP/WS
├── public/                 # Frontend (Vanilla JS + CSS3)
│   ├── index.html          # Interfaz principal
│   ├── js/chat.js          # Lógica WebRTC y WebSocket
│   └── css/styles.css      # Diseño responsive y UI
└── logs/                   # Directorio de auditoría (auto-generado)
```

---

## 🚀 Inicio Rápido (Desarrollo)

### 1. Requisitos Previos
- Node.js (v16+)
- Un archivo `.env` en la carpeta `server/` con la variable `TURN_SECRET`.

### 2. Instalación
```bash
cd server
npm install
```

### 3. Iniciar el Servidor
```bash
npm start
```
> El servidor iniciará en `http://localhost:8443` por defecto (WebSocket en `ws://`).

### 4. Acceder al Cliente
Abre `public/index.html` usando un servidor local (como **Live Server** de VS Code) para que el origen coincida con los permitidos en `constants.js`.

---

## 📊 Monitoreo y Auditoría

El sistema genera logs estructurados en la carpeta `logs/`. Estos logs incluyen:
- Intentos de conexión rechazados por CORS.
- Violaciones de Rate Limit.
- Eventos de señalización WebRTC.
- Estadísticas periódicas de usuarios activos.

*Nota: Los archivos rotan automáticamente al alcanzar los 10MB.*

---

## 📝 Roadmap (Próximos Pasos)

- [ ] Implementar autenticación robusta mediante JWT.
- [ ] Persistencia de historial de mensajes (Salas públicas) en base de datos.
- [ ] Transferencia de archivos mediante WebRTC DataChannels.
- [ ] Soporte para llamadas de audio/video P2P.

---

## 📄 Licencia y Créditos

Desarrollado con enfoque en la excelencia técnica.
© 2026 Edalmava.
