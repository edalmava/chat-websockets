/**
 * GESTOR DE EVENTOS WEBSOCKET
 */

const Websocket = require('ws');
const { isOriginAllowed, sanitizeHtml, sanitizeObject } = require('../utils/security');
const { validarUsuario, validarMensaje, verificarRateLimit } = require('../utils/validation');

const { obtenerConfigICE } = require('../utils/turnCredentials');
const { esSalaValida, SALAS_POR_DEFECTO } = require('../config/constants');

module.exports = function(wss, logger) {

    // ÍNDICE DE SALAS PARA ESCALABILIDAD
    // Map<NombreSala, Set<Websocket>>
    const salas = new Map();

    // REGISTRO GLOBAL DE USUARIOS (Para señalización P2P)
    // Map<NombreUsuario, Websocket>
    const usuariosConectados = new Map();

    /**
     * Añade un cliente a una sala en el índice
     */
    function agregarASala(ws, nombreSala) {
        if (!salas.has(nombreSala)) {
            salas.set(nombreSala, new Set());
        }
        salas.get(nombreSala).add(ws);
    }

    /**
     * Elimina un cliente de una sala en el índice
     */
    function quitarDeSala(ws, nombreSala) {
        if (salas.has(nombreSala)) {
            const salaSet = salas.get(nombreSala);
            salaSet.delete(ws);
            // Limpiar la sala del Map si queda vacía
            if (salaSet.size === 0) {
                salas.delete(nombreSala);
            }
        }
    }

    /**
     * Envía la lista de usuarios conectados a todos los clientes de una sala específica
     */
    function enviarListaUsuarios(sala) {
        const salaSet = salas.get(sala);
        if (!salaSet) return;

        const usuariosEnSala = Array.from(salaSet)
            .filter(client => client.usuarioIdentificado)
            .map(client => client.nombreUsuario);   
        
        broadcastMessage({ 
            tipo: 'lista-usuarios', 
            usuarios: usuariosEnSala,
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
            
            // OPTIMIZACIÓN: Si hay sala, usar el índice. Si no, recorrer todos.
            if (sala && salas.has(sala)) {
                salas.get(sala).forEach((client) => {
                    if (client.readyState === Websocket.OPEN) {     
                        client.send(data);
                    }
                });
            } else if (!sala) {
                // Caso global (broadcast a todo el servidor)
                wss.clients.forEach((client) => {
                    if (client.readyState === Websocket.OPEN) {     
                        client.send(data);
                    }   
                });
            }
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

        ws.send(JSON.stringify({
            tipo: 'salas-disponibles',
            salas: SALAS_POR_DEFECTO
        }));
        
        logger.log('INFO', 'client_connection', clientId, {
            origin,
            totalConexiones: wss.clients.size,
            userAgent
        });
        
        ws.id = clientId;
        ws.isAlive = true; // Para el Heartbeat
        ws.usuarioIdentificado = false;
        ws.nombreUsuario = null;
        ws.sala = null;
        ws.messageTimestamps = [];

        // Registrar latido (pong)
        ws.on('pong', () => {
            ws.isAlive = true;
        });

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

                            // Verificar si el nombre ya está en uso
                            if (usuariosConectados.has(validUser.usuario)) {
                                logger.log('WARNING', 'duplicate_username_attempt', clientId, { username: validUser.usuario });
                                enviarError(ws, 'El nombre de usuario ya está en uso. Por favor, elige otro.');
                                return;
                            }

                            ws.nombreUsuario = validUser.usuario;
                            ws.usuarioIdentificado = true;
                            logger.log('INFO', 'user_identified', clientId, { username: ws.nombreUsuario });
                        }

                        // Asignar nueva sala
                        const nuevaSala = messageData.sala;

                        if (!esSalaValida(nuevaSala)) {
                            logger.log('WARNING', 'invalid_room', clientId, {
                                username: ws.nombreUsuario,
                                sala_recibida: nuevaSala
                            });
                            enviarError(ws, `Sala inválida. Las salas disponibles son: ${SALAS_POR_DEFECTO.join(', ')}`);
                            return;
                        }
                        
                        // Si cambia de sala, notificar salida de la antigua y actualizar índice
                        if (antiguaSala && antiguaSala !== nuevaSala) {
                            quitarDeSala(ws, antiguaSala);
                            broadcastMessage({
                                usuario: 'Servidor',
                                mensaje: `El usuario "${ws.nombreUsuario}" ha dejado la sala`,
                                tipo: 'sistema',
                                timestamp: new Date().toISOString()
                            }, antiguaSala);
                        }

                        // Actualizar estado del socket e índice de salas
                        ws.sala = nuevaSala;
                        agregarASala(ws, nuevaSala);
                        
                        // Registrar en el mapa global para señalización WebRTC
                        usuariosConectados.set(ws.nombreUsuario, ws);

                        // Confirmar éxito al cliente
                        ws.send(JSON.stringify({ 
                            tipo: 'join-success',
                            sala: nuevaSala 
                        }));

                        // Notificar a la nueva sala
                        broadcastMessage({ 
                            usuario: 'Servidor', 
                            mensaje: `El usuario ${ws.nombreUsuario} se ha unido a la sala: ${nuevaSala}`,
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

                        // Enviar solo a la sala actual (usará el Map de salas)
                        broadcastMessage({
                            tipo: 'chat',
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
                        if (!ws.usuarioIdentificado || !ws.sala) return;

                        // Retransmitir solo a los de la misma sala usando el índice
                        const salaTyping = salas.get(ws.sala);
                        if (salaTyping) {
                            const typingMsg = JSON.stringify({
                                tipo: 'user-typing',
                                usuario: sanitizeHtml(ws.nombreUsuario),
                                escribiendo: !!messageData.escribiendo
                            });
                            
                            salaTyping.forEach((client) => {
                                if (client !== ws && client.readyState === Websocket.OPEN) {
                                    client.send(typingMsg);
                                }
                            });
                        }
                        break;

                    case 'webrtc-signal':
                        if (!ws.usuarioIdentificado) return;
                        
                        const destinatario = messageData.para;
                        const targetWs = usuariosConectados.get(destinatario);

                        if (targetWs && targetWs.readyState === Websocket.OPEN) {
                            targetWs.send(JSON.stringify({
                                tipo: 'webrtc-signal',
                                de: ws.nombreUsuario,
                                data: messageData.data
                            }));
                        }
                        break;

                    case 'get-ice-config':
                        if (!ws.usuarioIdentificado) {
                            logger.log('WARNING', 'ice_config_unidentified', clientId, {});
                            enviarError(ws, 'Debes identificarte primero');
                            return;
                        }

                        const iceConfig = obtenerConfigICE(ws.nombreUsuario, 1);

                        ws.iceIssuedAt = Date.now(); // ← guardar cuándo se emitieron

                        ws.send(JSON.stringify({
                            tipo: 'ice-config',
                            config: iceConfig
                        }));

                        logger.log('DEBUG', 'ice_config_sent', clientId, {
                            username: ws.nombreUsuario,
                            expiracion: iceConfig.iceServers[1]?.username?.split(':')[0]
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
                
                // Limpiar del registro global
                if (ws.nombreUsuario) {
                    usuariosConectados.delete(ws.nombreUsuario);
                }

                if (ws.sala) {
                    quitarDeSala(ws, ws.sala);
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

    // Reporte periódico y Heartbeat
    const interval = setInterval(() => {
        const usuariosIdentificados = Array.from(wss.clients).filter(c => c.usuarioIdentificado).length;
        logger.log('INFO', 'stats_report', 'system', { usuariosActivos: usuariosIdentificados, totalConexiones: wss.clients.size });

        // Verificar Heartbeat para cada cliente
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                logger.log('INFO', 'client_terminated_heartbeat', ws.id, { username: ws.nombreUsuario });
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping(); // Envía un frame de ping
        });
    }, 30000);

    // El intervalo solo renueva a quienes llevan más de 50 minutos
    const ICE_TTL_MS = 60 * 60 * 1000;      // 1 hora (igual que el TTL real)
    const ICE_REFRESH_THRESHOLD = 50 * 60 * 1000; // renovar a los 50 min

    setInterval(() => {
        const ahora = Date.now();
        wss.clients.forEach(client => {
            if (
                client.usuarioIdentificado &&
                client.readyState === Websocket.OPEN &&
                client.iceIssuedAt &&
                (ahora - client.iceIssuedAt) >= ICE_REFRESH_THRESHOLD
            ) {
                const iceConfig = obtenerConfigICE(client.nombreUsuario, 1);
                client.iceIssuedAt = ahora; // ← resetear el timestamp
                client.send(JSON.stringify({ tipo: 'ice-config', config: iceConfig }));
            }
        });
    }, 5 * 60 * 1000); // revisar cada 5 minutos es suficiente

    wss.on('close', () => {
        clearInterval(interval);
    });
};
