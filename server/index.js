const Websocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const Logger = require('./Logger');
//const Logger = require('./Logger');

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

// Inicializar logger (auditoría persistente a archivos JSON)
const logger = new Logger();

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
        logger.log('ERROR', 'broadcast_error', 'system', {
            errorMsg: error.message
        });
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
        logger.log('ERROR', 'send_error_failed', 'system', {
            errorMsg: err.message
        });
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
        logger.log('WARNING', 'cors_rejected', clientId, {
            origin_rechazado: origin
        });
        ws.close(1008, 'Origen no autorizado (CORS)');
        return;
    }
    
    logger.log('INFO', 'client_connection', clientId, {
        origin: origin,
        totalConexiones: wss.clients.size,
        userAgent: userAgent
    });
    
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
                logger.log('WARNING', 'invalid_json', clientId, {
                    error: parseError.message
                });
                enviarError(ws, 'JSON inválido. Asegúrate de enviar un objeto válido');
                return;
            }

            // PRIMER MENSAJE: Identificar al usuario
            if (!ws.usuarioIdentificado) {
                // Validar nombre de usuario
                const validación = validarUsuario(messageData.usuario);
                if (!validación.válido) {
                    logger.log('WARNING', 'user_validation_failed', clientId, {
                        razon: validación.error
                    });
                    enviarError(ws, validación.error);
                    return;
                }

                ws.nombreUsuario = validación.usuario;
                ws.usuarioIdentificado = true;
                
                logger.log('INFO', 'user_identified', clientId, {
                    username: ws.nombreUsuario
                });
                
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
            // Medir latencia
            const messageStartTime = Date.now();
            
            // Verificar rate limit
            const rateLimitCheck = verificarRateLimit(ws);
            if (!rateLimitCheck.permitido) {
                logger.log('WARNING', 'rate_limit_exceeded', clientId, {
                    username: ws.nombreUsuario
                });
                enviarError(ws, rateLimitCheck.error);
                return;
            }

            // Validar contenido del mensaje
            const validaciónMensaje = validarMensaje(messageData.mensaje);
            if (!validaciónMensaje.válido) {
                logger.log('WARNING', 'message_validation_failed', clientId, {
                    username: ws.nombreUsuario,
                    razon: validaciónMensaje.error
                });
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
            
            // Log de mensaje (nivel DEBUG)
            logger.log('DEBUG', 'message_broadcast', clientId, {
                username: ws.nombreUsuario,
                messageLength: validaciónMensaje.mensaje.length,
                latency_ms: Date.now() - messageStartTime
            });

        } catch (error) {
            logger.log('ERROR', 'message_processing_error', clientId, {
                username: ws.nombreUsuario || 'desconocido',
                errorMsg: error.message
            });
            enviarError(ws, 'Error interno al procesar el mensaje');
        }
    });

    // ========================================
    // EVENTO: DESCONEXIÓN
    // ========================================
    ws.on('close', () => {
        if (ws.usuarioIdentificado) {
            logger.log('INFO', 'user_disconnection', clientId, {
                username: ws.nombreUsuario,
                totalConexiones: wss.clients.size - 1
            });
            
            broadcastMessage({ 
                usuario: 'Servidor', 
                mensaje: `El usuario "${ws.nombreUsuario}" se ha desconectado`,
                tipo: 'sistema',
                timestamp: new Date().toISOString()
            });
            
            enviarListaUsuarios();
        } else {
            logger.log('DEBUG', 'client_disconnection_unidentified', clientId, {});
        }

        // Limpiar referencias para evitar memory leaks
        ws.messageTimestamps = [];
    });

    // ========================================
    // EVENTO: ERROR
    // ========================================
    ws.on('error', (error) => {
        logger.log('ERROR', 'websocket_error', clientId, {
            username: ws.nombreUsuario || 'desconocido',
            errorMsg: error.message
        });
    });
});

// ============================================
// ESTADÍSTICAS Y MONITOREO
// ============================================

setInterval(() => {
    const usuariosConectados = Array.from(wss.clients)
        .filter(client => client.usuarioIdentificado)
        .length;
    logger.log('INFO', 'stats_report', 'system', {
        usuariosActivos: usuariosConectados,
        totalConexiones: wss.clients.size
    });
}, 30000); // Cada 30 segundos

// ============================================
// INIT DEL SERVIDOR
// ============================================

httpsServer.listen(PORT, () => {
    logger.log('INFO', 'server_started', 'system', {
        url: `wss://localhost:${PORT}`,
        certsPath: 'certs/',
        correlativosPermitidos: ALLOWED_ORIGINS.length
    });

    console.log(`\n🚀 Servidor WSS (WebSocket Secure) iniciado`);
    console.log(`🔒 URL: wss://localhost:${PORT}`);
    console.log(`🔑 Certificados SSL cargados desde: certs/`);
    console.log(`📝 Logs guardados en: ${logger.LOG_DIR}`);
    console.log(`\n🌐 Configuración CORS (${ALLOWED_ORIGINS.length} orígenes permitidos):`);
    ALLOWED_ORIGINS.forEach((origin, idx) => {
        console.log(`   ${idx + 1}. ${origin}`);
    });
    console.log(`\n⚙️  Validación de Datos:`);
    console.log(`   - Username: ${VALIDACIÓN.USERNAME_MIN}-${VALIDACIÓN.USERNAME_MAX} caracteres`);
    console.log(`   - Mensaje: ${VALIDACIÓN.MESSAGE_MIN}-${VALIDACIÓN.MESSAGE_MAX} caracteres`);
    console.log(`   - Rate limit: ${VALIDACIÓN.RATE_LIMIT_MESSAGES} mensajes/${VALIDACIÓN.RATE_LIMIT_WINDOW}ms`);
    console.log(`\n🛡️  Características de Seguridad:`);
    console.log(`   - Encriptación WSS/TLS: ACTIVADA`);
    console.log(`   - Sanitización XSS: ACTIVADA`);
    console.log(`   - CORS: ACTIVADO`);
    console.log(`   - Rate limiting: ACTIVADO`);
    console.log(`   - Validación de entrada: ACTIVADA`);
    console.log(`   - Logging persistente: ACTIVADO (JSON + Rotación Automática)`);
    console.log(`\n📝 Nota: Para producción, actualiza ALLOWED_ORIGINS con tus dominios\n`);
});