const Websocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURACIÓN HTTPS/WSS
// ============================================
const certDir = path.join(__dirname, '../certs');
const options = {
    cert: fs.readFileSync(path.join(certDir, 'server.crt')),
    key: fs.readFileSync(path.join(certDir, 'server.key'))
};

// Crear servidor HTTPS
const httpsServer = https.createServer(options);

// Crear WebSocket Server sobre HTTPS (WSS)
const wss = new Websocket.Server({ server: httpsServer });

// ============================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================
const PORT = 8443;

// Orígenes permitidos para CORS (WebSocket)
const ALLOWED_ORIGINS = [
    'http://localhost:5500',    // Live Server (VS Code)
    'http://localhost:3000',    // Servidores locales comunes
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080',
    'https://localhost:5500',   // HTTPS local
    'https://localhost:3000',
    'https://127.0.0.1:5500',
    'https://127.0.0.1:3000',
    // En producción, agregar tu dominio:
    // 'https://www.tudominio.com',
    // 'https://tudominio.com'
];

const VALIDACIÓN = {
    USERNAME_MIN: 1,
    USERNAME_MAX: 50,
    MESSAGE_MIN: 1,
    MESSAGE_MAX: 500,
    RATE_LIMIT_MESSAGES: 5,
    RATE_LIMIT_WINDOW: 1000
};

// ============================================
// FUNCIONES DE SEGURIDAD
// ============================================

/**
 * Valida si el origen está permitido (CORS)
 * @param {string} origin - Header 'Origin' de la solicitud
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Escapa caracteres HTML peligrosos para prevenir XSS
 * @param {string} text - Texto a sanitizar
 * @returns {string} Texto escapado
 */
function sanitizeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, char => htmlEscapeMap[char]);
}

/**
 * Sanitiza recursivamente un objeto (usuario y mensaje)
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = { ...obj };
    if (sanitized.usuario) sanitized.usuario = sanitizeHtml(sanitized.usuario);
    if (sanitized.mensaje) sanitized.mensaje = sanitizeHtml(sanitized.mensaje);
    
    return sanitized;
}

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

/**
 * Registra un mensaje con timestamp en consola
 */
function log(message) {
    const timestamp = new Date().toLocaleString('es-ES');
    console.log(`[${timestamp}] ${message}`);
}

/**
 * Valida que el usuario tenga formato correcto
 */
function validarUsuario(usuario) {
    if (!usuario || typeof usuario !== 'string') {
        return { válido: false, error: 'El nombre de usuario es requerido' };
    }

    usuario = usuario.trim();

    if (usuario.length < VALIDACIÓN.USERNAME_MIN || usuario.length > VALIDACIÓN.USERNAME_MAX) {
        return { 
            válido: false, 
            error: `El nombre debe tener entre ${VALIDACIÓN.USERNAME_MIN} y ${VALIDACIÓN.USERNAME_MAX} caracteres` 
        };
    }

    if (!/^[a-zA-Z0-9\s\-_.@áéíóúÁÉÍÓÚñÑ]+$/.test(usuario)) {
        return { válido: false, error: 'El nombre contiene caracteres inválidos' };
    }

    return { válido: true, usuario: usuario };
}

/**
 * Valida que el mensaje tenga formato correcto
 */
function validarMensaje(mensaje) {
    if (!mensaje || typeof mensaje !== 'string') {
        return { válido: false, error: 'El mensaje es requerido' };
    }

    mensaje = mensaje.trim();

    if (mensaje.length < VALIDACIÓN.MESSAGE_MIN || mensaje.length > VALIDACIÓN.MESSAGE_MAX) {
        return { 
            válido: false, 
            error: `El mensaje debe tener entre ${VALIDACIÓN.MESSAGE_MIN} y ${VALIDACIÓN.MESSAGE_MAX} caracteres` 
        };
    }

    return { válido: true, mensaje: mensaje };
}

/**
 * Verifica si el cliente ha excedido el límite de frecuencia (rate limiting)
 */
function verificarRateLimit(client) {
    const ahora = Date.now();
    
    // Inicializar historial si no existe
    if (!client.messageTimestamps) {
        client.messageTimestamps = [];
    }

    // Remover mensajes fuera de la ventana de tiempo
    client.messageTimestamps = client.messageTimestamps.filter(
        timestamp => ahora - timestamp < VALIDACIÓN.RATE_LIMIT_WINDOW
    );

    // Verificar si se excedió el límite
    if (client.messageTimestamps.length >= VALIDACIÓN.RATE_LIMIT_MESSAGES) {
        return { permitido: false, error: `Demasiados mensajes. Máximo ${VALIDACIÓN.RATE_LIMIT_MESSAGES} por segundo` };
    }

    // Registrar este mensaje
    client.messageTimestamps.push(ahora);
    return { permitido: true };
}

/**
 * Envía la lista de usuarios conectados a todos los clientes
 */
function enviarListaUsuarios() {
    const usuariosConectados = Array.from(wss.clients)
        .filter(client => client.usuarioIdentificado)
        .map(client => client.nombreUsuario);   
    
    broadcastMessage({ 
        tipo: 'lista-usuarios', 
        usuarios: usuariosConectados,
        timestamp: new Date().toISOString()
    });
}

/**
 * Envía un mensaje a todos los clientes conectados
 */
function broadcastMessage(obj) {
    try {
        // Sanitizar datos antes de enviar
        const sanitized = sanitizeObject(obj);
        const data = JSON.stringify(sanitized);
        
        wss.clients.forEach((client) => {
            if (client.readyState === Websocket.OPEN) {     
                client.send(data);
            }   
        });
    } catch (error) {
        log(`❌ Error al enviar mensaje broadcast: ${error.message}`);
    }
}

/**
 * Envía un mensaje de error solo a un cliente específico
 */
function enviarError(client, error) {
    try {
        if (client.readyState === Websocket.OPEN) {
            const errorObj = {
                usuario: 'Servidor',
                mensaje: sanitizeHtml(error),
                tipo: 'error',
                timestamp: new Date().toISOString()
            };
            client.send(JSON.stringify(errorObj));
        }
    } catch (err) {
        log(`❌ Error al enviar error al cliente: ${err.message}`);
    }
}

// ============================================
// EVENTO: NUEVA CONEXIÓN
// ============================================

wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    const origin = req.headers.origin || 'sin-origen';
    const userAgent = req.headers['user-agent'] || 'desconocido';
    
    // VALIDACIÓN CORS: Verificar origen permitido
    if (!isOriginAllowed(req.headers.origin)) {
        log(`🚫 CORS BLOQUEADO: Origen no permitido "${origin}"`);
        ws.close(1008, 'Origen no autorizado (CORS)');
        return;
    }
    
    log(`✅ Cliente conectado: ${clientId}`);
    log(`   Origen: ${origin}`);
    log(`   Total de conexiones: ${wss.clients.size}`);
    
    // Inicializar propiedades del cliente
    ws.id = clientId;
    ws.origin = origin;
    ws.usuarioIdentificado = false;
    ws.nombreUsuario = null;
    ws.messageTimestamps = [];

    // ========================================
    // EVENTO: MENSAJE RECIBIDO
    // ========================================
    ws.on('message', (message) => {
        try {
            // Intentar parsear JSON
            let messageData;
            try {
                messageData = JSON.parse(message.toString());
            } catch (parseError) {
                log(`⚠️  Cliente ${clientId} envió JSON inválido`);
                enviarError(ws, 'JSON inválido. Asegúrate de enviar un objeto válido');
                return;
            }

            // PRIMER MENSAJE: Identificar al usuario
            if (!ws.usuarioIdentificado) {
                // Validar nombre de usuario
                const validación = validarUsuario(messageData.usuario);
                if (!validación.válido) {
                    log(`⚠️  Cliente ${clientId} - Validación fallida: ${validación.error}`);
                    enviarError(ws, validación.error);
                    return;
                }

                ws.nombreUsuario = validación.usuario;
                ws.usuarioIdentificado = true;
                
                log(`🆔 Usuario identificado: "${ws.nombreUsuario}" (${clientId})`);
                
                // Notificar a todos que el usuario se conectó
                broadcastMessage({ 
                    usuario: 'Servidor', 
                    mensaje: `El usuario "${ws.nombreUsuario}" se ha conectado`,
                    tipo: 'sistema',
                    timestamp: new Date().toISOString()
                });
                
                enviarListaUsuarios();
                return;
            }

            // MENSAJES SIGUIENTES: Validar y enviar mensaje
            // Verificar rate limit
            const rateLimitCheck = verificarRateLimit(ws);
            if (!rateLimitCheck.permitido) {
                log(`⏱️  Cliente ${ws.nombreUsuario} - Rate limit excedido`);
                enviarError(ws, rateLimitCheck.error);
                return;
            }

            // Validar contenido del mensaje
            const validaciónMensaje = validarMensaje(messageData.mensaje);
            if (!validaciónMensaje.válido) {
                log(`⚠️  Cliente ${ws.nombreUsuario} - Validación de mensaje fallida: ${validaciónMensaje.error}`);
                enviarError(ws, validaciónMensaje.error);
                return;
            }

            // Enviar mensaje a todos
            const mensajeFinal = {
                usuario: ws.nombreUsuario,
                mensaje: validaciónMensaje.mensaje,
                timestamp: new Date().toISOString()
            };
            
            broadcastMessage(mensajeFinal);
            log(`💬 Mensaje de "${ws.nombreUsuario}": "${validaciónMensaje.mensaje.substring(0, 50)}${validaciónMensaje.mensaje.length > 50 ? '...' : ''}"`);

        } catch (error) {
            log(`❌ Error procesando mensaje: ${error.message}`);
            enviarError(ws, 'Error interno al procesar el mensaje');
        }
    });

    // ========================================
    // EVENTO: DESCONEXIÓN
    // ========================================
    ws.on('close', () => {
        if (ws.usuarioIdentificado) {
            log(`👋 Usuario desconectado: "${ws.nombreUsuario}" (${clientId}) (Total: ${wss.clients.size - 1})`);
            
            broadcastMessage({ 
                usuario: 'Servidor', 
                mensaje: `El usuario "${ws.nombreUsuario}" se ha desconectado`,
                tipo: 'sistema',
                timestamp: new Date().toISOString()
            });
            
            enviarListaUsuarios();
        } else {
            log(`👋 Cliente desconectado antes de identificarse: ${clientId}`);
        }

        // Limpiar referencias para evitar memory leaks
        ws.messageTimestamps = [];
    });

    // ========================================
    // EVENTO: ERROR
    // ========================================
    ws.on('error', (error) => {
        log(`❌ Error en cliente ${clientId}: ${error.message}`);
    });
});

// ============================================
// ESTADÍSTICAS Y MONITOREO
// ============================================

setInterval(() => {
    const usuariosConectados = Array.from(wss.clients)
        .filter(client => client.usuarioIdentificado)
        .length;
    log(`📊 Estadísticas - Clientes activos: ${usuariosConectados} / Total de conexiones: ${wss.clients.size}`);
}, 30000); // Cada 30 segundos

// ============================================
// INIT DEL SERVIDOR
// ============================================

httpsServer.listen(PORT, () => {
    log(`🚀 Servidor WSS (WebSocket Secure) iniciado`);
    log(`🔒 URL: wss://localhost:${PORT}`);
    log(`🔑 Certificados SSL cargados desde: certs/`);
    log(`\n🌐 Configuración CORS (Orígenes Permitidos):`);
    ALLOWED_ORIGINS.forEach((origin, idx) => {
        log(`   ${idx + 1}. ${origin}`);
    });
    log(`\n⚙️  Validación de Datos:`);
    log(`   - Username: ${VALIDACIÓN.USERNAME_MIN}-${VALIDACIÓN.USERNAME_MAX} caracteres`);
    log(`   - Mensaje: ${VALIDACIÓN.MESSAGE_MIN}-${VALIDACIÓN.MESSAGE_MAX} caracteres`);
    log(`   - Rate limit: ${VALIDACIÓN.RATE_LIMIT_MESSAGES} mensajes/${VALIDACIÓN.RATE_LIMIT_WINDOW}ms`);
    log(`\n🛡️  Características de Seguridad:`);
    log(`   - Encriptación WSS/TLS: ACTIVADA`);
    log(`   - Sanitización XSS: ACTIVADA`);
    log(`   - CORS: ACTIVADO`);
    log(`   - Rate limiting: ACTIVADO`);
    log(`   - Validación de entrada: ACTIVADA`);
    log(`\n📝 Nota: Para producción, actualiza ALLOWED_ORIGINS con tus dominios\n`);
});