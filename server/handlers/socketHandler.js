/**
 * GESTOR DE EVENTOS WEBSOCKET
 */

const Websocket = require('ws');
const { isOriginAllowed, sanitizeHtml, sanitizeObject } = require('../utils/security');
const { validarUsuario, validarMensaje, verificarRateLimit } = require('../utils/validation');

module.exports = function(wss, logger) {

    /**
     * Envía la lista de usuarios conectados a todos los clientes de una sala específica
     */
    function enviarListaUsuarios(sala) {
        const usuariosConectados = Array.from(wss.clients)
            .filter(client => client.usuarioIdentificado && client.sala === sala)
            .map(client => client.nombreUsuario);   
        
        broadcastMessage({ 
            tipo: 'lista-usuarios', 
            usuarios: usuariosConectados,
            timestamp: new Date().toISOString()
        }, sala);
    }

    /**
     * Envía un mensaje a todos los clientes conectados (opcionalmente filtrado por sala)
     */
    function broadcastMessage(obj, sala = null) {
        try {
            const sanitized = sanitizeObject(obj);
            const data = JSON.stringify(sanitized);
            
            wss.clients.forEach((client) => {
                if (client.readyState === Websocket.OPEN) {     
                    // Si se especifica sala, filtrar. Si no, enviar a todos.
                    if (!sala || client.sala === sala) {
                        client.send(data);
                    }
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
        ws.sala = null;
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
                        const antiguaSala = ws.sala;

                        // Validar nombre de usuario (solo si no está ya identificado)
                        if (!ws.usuarioIdentificado) {
                            const validUser = validarUsuario(messageData.usuario);
                            if (!validUser.válido) {
                                logger.log('WARNING', 'user_validation_failed', clientId, { razon: validUser.error });
                                enviarError(ws, validUser.error);
                                return;
                            }
                            ws.nombreUsuario = validUser.usuario;
                            ws.usuarioIdentificado = true;
                            logger.log('INFO', 'user_identified', clientId, { username: ws.nombreUsuario });
                        }

                        // Asignar nueva sala
                        const nuevaSala = messageData.sala || 'General';
                        
                        // Si cambia de sala, notificar salida de la antigua
                        if (antiguaSala && antiguaSala !== nuevaSala) {
                            broadcastMessage({
                                usuario: 'Servidor',
                                mensaje: `El usuario "${ws.nombreUsuario}" ha dejado la sala`,
                                tipo: 'sistema',
                                timestamp: new Date().toISOString()
                            }, antiguaSala);
                        }

                        ws.sala = nuevaSala;
                        
                        // Confirmar éxito al cliente
                        ws.send(JSON.stringify({ 
                            tipo: 'join-success',
                            sala: nuevaSala 
                        }));

                        // Notificar a la nueva sala
                        broadcastMessage({ 
                            usuario: 'Servidor', 
                            mensaje: `El usuario "${ws.nombreUsuario}" se ha unido a la sala: ${nuevaSala}`,
                            tipo: 'sistema',
                            timestamp: new Date().toISOString()
                        }, nuevaSala);
                        
                        // Actualizar listas de usuarios en ambas salas si hubo cambio
                        if (antiguaSala && antiguaSala !== nuevaSala) {
                            enviarListaUsuarios(antiguaSala);
                        }
                        enviarListaUsuarios(nuevaSala);
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

                        // Enviar solo a la sala actual
                        broadcastMessage({
                            usuario: ws.nombreUsuario,
                            mensaje: validMsg.mensaje,
                            timestamp: new Date().toISOString()
                        }, ws.sala);
                        
                        logger.log('DEBUG', 'message_broadcast', clientId, {
                            username: ws.nombreUsuario,
                            sala: ws.sala,
                            latency_ms: Date.now() - messageStartTime
                        });
                        break;

                    case 'typing':
                        if (!ws.usuarioIdentificado) return;

                        // Retransmitir solo a los de la misma sala
                        wss.clients.forEach((client) => {
                            if (client !== ws && client.readyState === Websocket.OPEN && client.sala === ws.sala) {
                                client.send(JSON.stringify({
                                    tipo: 'user-typing',
                                    usuario: ws.nombreUsuario,
                                    escribiendo: messageData.escribiendo
                                }));
                            }
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
                
                if (ws.sala) {
                    broadcastMessage({ 
                        usuario: 'Servidor', 
                        mensaje: `El usuario "${ws.nombreUsuario}" se ha desconectado`,
                        tipo: 'sistema',
                        timestamp: new Date().toISOString()
                    }, ws.sala);
                    
                    enviarListaUsuarios(ws.sala);
                }
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
