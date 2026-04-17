/**
 * GESTOR DE EVENTOS WEBSOCKET
 */

const Websocket = require('ws');
const { isOriginAllowed, sanitizeHtml, sanitizeObject } = require('../utils/security');
const { validarUsuario, validarMensaje, verificarRateLimit } = require('../utils/validation');

module.exports = function(wss, logger) {

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

    // MANEJAR NUEVAS CONEXIONES
    wss.on('connection', (ws, req) => {
        const clientId = Math.random().toString(36).substr(2, 9);
        const origin = req.headers.origin || 'sin-origen';
        const userAgent = req.headers['user-agent'] || 'desconocido';
        
        if (!isOriginAllowed(req.headers.origin)) {
            logger.log('WARNING', 'cors_rejected', clientId, { origin_rechazado: origin });
            ws.close(1008, 'Origen no autorizado (CORS)');
            return;
        }
        
        logger.log('INFO', 'client_connection', clientId, {
            origin,
            totalConexiones: wss.clients.size,
            userAgent
        });
        
        ws.id = clientId;
        ws.usuarioIdentificado = false;
        ws.nombreUsuario = null;
        ws.messageTimestamps = [];

        ws.on('message', (message) => {
            try {
                let messageData;
                try {
                    messageData = JSON.parse(message.toString());
                } catch (parseError) {
                    logger.log('WARNING', 'invalid_json', clientId, { error: parseError.message });
                    enviarError(ws, 'JSON inválido');
                    return;
                }

                switch (messageData.tipo) {
                    case 'join':
                        if (ws.usuarioIdentificado) return;

                        const validUser = validarUsuario(messageData.usuario);
                        if (!validUser.válido) {
                            logger.log('WARNING', 'user_validation_failed', clientId, { razon: validUser.error });
                            enviarError(ws, validUser.error);
                            return;
                        }

                        ws.nombreUsuario = validUser.usuario;
                        ws.usuarioIdentificado = true;
                        
                        logger.log('INFO', 'user_identified', clientId, { username: ws.nombreUsuario });
                        ws.send(JSON.stringify({ tipo: 'join-success' }));

                        broadcastMessage({ 
                            usuario: 'Servidor', 
                            mensaje: `El usuario "${ws.nombreUsuario}" se ha conectado`,
                            tipo: 'sistema',
                            timestamp: new Date().toISOString()
                        });
                        
                        enviarListaUsuarios();
                        break;

                    case 'chat':
                        if (!ws.usuarioIdentificado) {
                            logger.log('WARNING', 'chat_attempt_unidentified', clientId, {});
                            enviarError(ws, 'Debes identificarte primero');
                            return;
                        }

                        const messageStartTime = Date.now();
                        const rateLimitCheck = verificarRateLimit(ws);
                        if (!rateLimitCheck.permitido) {
                            logger.log('WARNING', 'rate_limit_exceeded', clientId, { username: ws.nombreUsuario });
                            enviarError(ws, rateLimitCheck.error);
                            return;
                        }

                        const validMsg = validarMensaje(messageData.mensaje);
                        if (!validMsg.válido) {
                            logger.log('WARNING', 'message_validation_failed', clientId, { username: ws.nombreUsuario, razon: validMsg.error });
                            enviarError(ws, validMsg.error);
                            return;
                        }

                        broadcastMessage({
                            usuario: ws.nombreUsuario,
                            mensaje: validMsg.mensaje,
                            timestamp: new Date().toISOString()
                        });
                        
                        logger.log('DEBUG', 'message_broadcast', clientId, {
                            username: ws.nombreUsuario,
                            latency_ms: Date.now() - messageStartTime
                        });
                        break;

                    default:
                        logger.log('WARNING', 'unknown_message_type', clientId, { tipo: messageData.tipo });
                        enviarError(ws, 'Tipo de mensaje desconocido');
                        break;
                }
            } catch (error) {
                logger.log('ERROR', 'message_processing_error', clientId, { errorMsg: error.message });
                enviarError(ws, 'Error interno');
            }
        });

        ws.on('close', () => {
            if (ws.usuarioIdentificado) {
                logger.log('INFO', 'user_disconnection', clientId, { username: ws.nombreUsuario, totalConexiones: wss.clients.size - 1 });
                broadcastMessage({ 
                    usuario: 'Servidor', 
                    mensaje: `El usuario "${ws.nombreUsuario}" se ha desconectado`,
                    tipo: 'sistema',
                    timestamp: new Date().toISOString()
                });
                enviarListaUsuarios();
            }
        });

        ws.on('error', (error) => {
            logger.log('ERROR', 'websocket_error', clientId, { errorMsg: error.message });
        });
    });

    // Reporte periódico
    setInterval(() => {
        const usuariosConectados = Array.from(wss.clients).filter(c => c.usuarioIdentificado).length;
        logger.log('INFO', 'stats_report', 'system', { usuariosActivos: usuariosConectados, totalConexiones: wss.clients.size });
    }, 30000);
};
