/**
 * GESTOR DE EVENTOS WEBSOCKET CON SOPORTE SUPABASE AUTH Y ROLES
 */

const Websocket = require('ws');
const { isOriginAllowed, sanitizeHtml, sanitizeObject } = require('../utils/security');
const { validarMensaje, verificarRateLimit, validarRol, validarDuracionMute } = require('../utils/validation');
const { verificarAutenticacion, verificarPermiso, verificarToken } = require('../middleware/authMiddleware');

const { obtenerConfigICE } = require('../utils/turnCredentials');
const { esSalaValida, SALAS_POR_DEFECTO, ROLES } = require('../config/constants');

module.exports = function(wss, logger) {

    // ÍNDICE DE SALAS PARA ESCALABILIDAD
    // Map<NombreSala, Set<Websocket>>
    const salas = new Map();

    // REGISTRO GLOBAL DE USUARIOS CONECTADOS (Clave: userId de Supabase UUID)
    // Map<UUID, Websocket>
    const usuariosConectados = new Map();

    // REGISTRO DE USUARIOS SILENCIADOS
    // Map<UUID, { hasta: timestamp, por: displayName }>
    const usuariosSilenciados = new Map();

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
     * Envía la lista de usuarios conectados (con sus roles) a todos los clientes de una sala específica
     */
    function enviarListaUsuarios(sala) {
        const salaSet = salas.get(sala);
        if (!salaSet) return;

        const usuariosEnSala = Array.from(salaSet)
            .filter(client => client.usuarioIdentificado)
            .map(client => ({
                userId: client.userId,
                displayName: client.nombreUsuario,
                role: client.role
            }));   
        
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
            logger.log('ERROR', 'send_error_failed', client.id || 'desconocido', {
                errorMsg: err.message
            });
        }
    }

    /**
     * Envía la configuración ICE (STUN/TURN) a un cliente específico
     */
    function enviarIceConfig(client) {
        try {
            if (client.readyState === Websocket.OPEN && client.usuarioIdentificado) {
                const iceConfig = obtenerConfigICE(client.nombreUsuario, 1);
                client.iceIssuedAt = Date.now();
                client.send(JSON.stringify({
                    tipo: 'ice-config',
                    config: iceConfig
                }));
                
                logger.log('DEBUG', 'ice_config_sent', client.id, {
                    username: client.nombreUsuario,
                    expiracion: iceConfig.iceServers[1]?.username?.split(':')[0]
                });
            }
        } catch (error) {
            logger.log('ERROR', 'ice_config_send_failed', client.id, { errorMsg: error.message });
        }
    }

    // MANEJAR NUEVAS CONEXIONES
    wss.on('connection', async (ws, req) => {
        const clientId = Math.random().toString(36).substr(2, 9);
        const origin = req.headers.origin || 'sin-origen';
        const userAgent = req.headers['user-agent'] || 'desconocido';
        
        // 1. Validación CORS
        if (!isOriginAllowed(req.headers.origin)) {
            logger.log('WARNING', 'cors_rejected', clientId, { origin_rechazado: origin });
            ws.close(1008, 'Origen no autorizado (CORS)');
            return;
        }

        // 2. Validación y Autenticación del Token JWT
        const authData = await verificarAutenticacion(ws, req, logger);
        if (!authData) {
            // Si el token es inválido o no existe, verificarAutenticacion ya cerró el socket
            return;
        }

        // 3. Control de sesiones simultáneas/duplicadas
        if (usuariosConectados.has(authData.userId)) {
            const oldWs = usuariosConectados.get(authData.userId);
            logger.log('INFO', 'session_duplicate_closed', oldWs.id, {
                userId: authData.userId,
                username: oldWs.nombreUsuario
            });
            oldWs.send(JSON.stringify({
                tipo: 'error',
                mensaje: 'Se ha iniciado sesión en otra ubicación. Conexión cerrada.',
                timestamp: new Date().toISOString()
            }));
            oldWs.close(4002, 'Sesión iniciada en otra ubicación');
        }

        // 4. Inicialización del estado de la conexión
        ws.id = clientId;
        ws.userId = authData.userId;
        ws.nombreUsuario = authData.displayName;
        ws.email = authData.email;
        ws.role = authData.role;
        ws.tokenExp = authData.tokenExp;
        ws.usuarioIdentificado = true; // El usuario queda autenticado inmediatamente
        ws.isAlive = true; // Para Heartbeat
        ws.sala = null;
        ws.messageTimestamps = [];

        // Registrar inmediatamente en el mapa global de usuarios en línea
        usuariosConectados.set(ws.userId, ws);

        logger.log('INFO', 'client_connection_authenticated', clientId, {
            userId: ws.userId,
            username: ws.nombreUsuario,
            role: ws.role,
            origin,
            totalConexiones: wss.clients.size,
            userAgent
        });

        // 5. Enviar información inicial al cliente
        ws.send(JSON.stringify({
            tipo: 'salas-disponibles',
            salas: SALAS_POR_DEFECTO
        }));

        ws.send(JSON.stringify({
            tipo: 'auth-info',
            role: ws.role,
            displayName: ws.nombreUsuario,
            userId: ws.userId
        }));

        // Registrar latido (pong)
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', async (message) => {
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

                        // Confirmar éxito al cliente
                        ws.send(JSON.stringify({ 
                            tipo: 'join-success',
                            sala: nuevaSala 
                        }));

                        // Enviar configuración ICE automáticamente tras el éxito del join
                        enviarIceConfig(ws);

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
                        // Validar si el usuario está silenciado temporalmente
                        if (usuariosSilenciados.has(ws.userId)) {
                            const muteInfo = usuariosSilenciados.get(ws.userId);
                            if (Date.now() < muteInfo.hasta) {
                                const restantes = Math.ceil((muteInfo.hasta - Date.now()) / 1000);
                                enviarError(ws, `Estás silenciado. No puedes enviar mensajes por los siguientes ${restantes} segundos. Silenciado por: ${muteInfo.por}.`);
                                return;
                            }
                            usuariosSilenciados.delete(ws.userId);
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
                            tipo: 'chat',
                            usuario: ws.nombreUsuario,
                            userId: ws.userId,
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
                        if (!ws.sala) return;

                        const salaTyping = salas.get(ws.sala);
                        if (salaTyping) {
                            const typingMsg = JSON.stringify({
                                tipo: 'user-typing',
                                userId: ws.userId,
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
                        const destinatarioId = messageData.para;
                        const targetWs = usuariosConectados.get(destinatarioId);

                        if (targetWs && targetWs.readyState === Websocket.OPEN) {
                            targetWs.send(JSON.stringify({
                                tipo: 'webrtc-signal',
                                de: ws.userId,
                                deNombre: ws.nombreUsuario,
                                data: messageData.data
                            }));
                        }
                        break;

                    case 'get-ice-config':
                        enviarIceConfig(ws);
                        break;

                    case 'token_refresh':
                        try {
                            const nuevoToken = messageData.token;
                            if (!nuevoToken) throw new Error('Token ausente');

                            const authData = await verificarToken(nuevoToken, logger);
                            if (!authData) throw new Error('Token inválido o expirado');

                            if (authData.userId !== ws.userId) {
                                throw new Error('El ID de usuario en el nuevo token no coincide con la sesión actual');
                            }

                            ws.tokenExp = authData.tokenExp;
                            ws.role = authData.role;
                            ws.nombreUsuario = authData.displayName;

                            ws.send(JSON.stringify({
                                tipo: 'token_refresh_ok',
                                role: ws.role,
                                displayName: ws.nombreUsuario
                            }));

                            logger.log('INFO', 'token_refresh_success', ws.id, {
                                userId: ws.userId,
                                username: ws.nombreUsuario,
                                role: ws.role
                            });

                            if (ws.sala) {
                                enviarListaUsuarios(ws.sala);
                            }
                        } catch (err) {
                            logger.log('WARNING', 'token_refresh_failed', ws.id, { error: err.message });
                            ws.close(4001, 'Token refresh falló');
                        }
                        break;

                    case 'kick_user':
                        if (!verificarPermiso(ws, 'kick_user')) {
                            enviarError(ws, 'No tienes permisos para expulsar usuarios');
                            break;
                        }
                        if (!verificarRateLimit(ws).permitido) {
                            enviarError(ws, 'Demasiadas solicitudes. Intenta de nuevo en un momento.');
                            break;
                        }

                        const targetKickId = messageData.payload?.userId;
                        const motivoKick = messageData.payload?.motivo || 'Expulsado por moderador';
                        const targetKickWs = usuariosConectados.get(targetKickId);

                        if (targetKickWs) {
                            logger.log('INFO', 'user_kicked', ws.id, {
                                target: targetKickWs.nombreUsuario,
                                targetId: targetKickId,
                                por: ws.nombreUsuario
                            });

                            targetKickWs.send(JSON.stringify({
                                tipo: 'kicked',
                                payload: {
                                    motivo: motivoKick,
                                    por: ws.nombreUsuario
                                }
                            }));

                            if (targetKickWs.sala) {
                                broadcastMessage({
                                    usuario: 'Servidor',
                                    mensaje: `El usuario "${targetKickWs.nombreUsuario}" ha sido expulsado de la sala por el moderador "${ws.nombreUsuario}" (${motivoKick})`,
                                    tipo: 'sistema',
                                    timestamp: new Date().toISOString()
                                }, targetKickWs.sala);
                            }

                            targetKickWs.close(4003, 'Expulsado por moderador');
                        } else {
                            enviarError(ws, 'Usuario objetivo no encontrado en línea');
                        }
                        break;

                    case 'mute_user':
                        if (!verificarPermiso(ws, 'mute_user')) {
                            enviarError(ws, 'No tienes permisos para silenciar usuarios');
                            break;
                        }
                        if (!verificarRateLimit(ws).permitido) {
                            enviarError(ws, 'Demasiadas solicitudes. Intenta de nuevo en un momento.');
                            break;
                        }

                        const targetMuteId = messageData.payload?.userId;
                        const duracionInput = messageData.payload?.duracion;

                        const muteVal = validarDuracionMute(duracionInput);
                        if (!muteVal.válido) {
                            enviarError(ws, muteVal.error);
                            break;
                        }

                        const targetMuteWs = usuariosConectados.get(targetMuteId);
                        if (targetMuteWs) {
                            const hastaTimestamp = Date.now() + (muteVal.duracion * 1000);
                            usuariosSilenciados.set(targetMuteId, {
                                hasta: hastaTimestamp,
                                por: ws.nombreUsuario
                            });

                            logger.log('INFO', 'user_muted', ws.id, {
                                target: targetMuteWs.nombreUsuario,
                                targetId: targetMuteId,
                                duracion: muteVal.duracion,
                                por: ws.nombreUsuario
                            });

                            targetMuteWs.send(JSON.stringify({
                                tipo: 'muted',
                                payload: {
                                    duracion: muteVal.duracion,
                                    por: ws.nombreUsuario
                                }
                            }));

                            if (targetMuteWs.sala) {
                                broadcastMessage({
                                    usuario: 'Servidor',
                                    mensaje: `El usuario "${targetMuteWs.nombreUsuario}" ha sido silenciado por ${muteVal.duracion} segundos por "${ws.nombreUsuario}"`,
                                    tipo: 'sistema',
                                    timestamp: new Date().toISOString()
                                }, targetMuteWs.sala);
                            }
                        } else {
                            enviarError(ws, 'Usuario objetivo no encontrado en línea');
                        }
                        break;

                    case 'cambiar_rol':
                        if (!verificarPermiso(ws, 'cambiar_rol')) {
                            enviarError(ws, 'No tienes permisos para cambiar roles');
                            break;
                        }
                        if (!verificarRateLimit(ws).permitido) {
                            enviarError(ws, 'Demasiadas solicitudes. Intenta de nuevo en un momento.');
                            break;
                        }

                        const targetRolId = messageData.payload?.userId;
                        const nuevoRol = messageData.payload?.nuevoRol;

                        const rolVal = validarRol(nuevoRol);
                        if (!rolVal.válido) {
                            enviarError(ws, rolVal.error);
                            break;
                        }

                        const targetRolWs = usuariosConectados.get(targetRolId);
                        if (targetRolWs) {
                            targetRolWs.role = nuevoRol;
                            logger.log('INFO', 'user_role_changed', ws.id, {
                                target: targetRolWs.nombreUsuario,
                                targetId: targetRolId,
                                nuevoRol,
                                por: ws.nombreUsuario
                            });

                            targetRolWs.send(JSON.stringify({
                                tipo: 'rol_actualizado',
                                payload: {
                                    nuevoRol
                                }
                            }));

                            targetRolWs.send(JSON.stringify({
                                tipo: 'auth-info',
                                role: targetRolWs.role,
                                displayName: targetRolWs.nombreUsuario,
                                userId: targetRolWs.userId
                            }));

                            if (targetRolWs.sala) {
                                enviarListaUsuarios(targetRolWs.sala);
                            }
                        } else {
                            enviarError(ws, 'Usuario objetivo no encontrado en línea (los cambios persistentes en la BD se aplicarán en su próximo login)');
                        }
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
            logger.log('INFO', 'user_disconnection', clientId, { 
                userId: ws.userId,
                username: ws.nombreUsuario, 
                totalConexiones: wss.clients.size - 1 
            });
            
            // Eliminar del registro global
            if (ws.userId) {
                usuariosConectados.delete(ws.userId);
            }

            if (ws.sala) {
                quitarDeSala(ws, ws.sala);
                broadcastMessage({ 
                    usuario: 'Servidor', 
                    mensaje: `El usuario "${ws.nombreUsuario}" ha dejado la sala`,
                    tipo: 'sistema',
                    timestamp: new Date().toISOString()
                }, ws.sala);
                
                enviarListaUsuarios(ws.sala);
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

    // Optimización de la renovación periódica de credenciales ICE
    const ICE_REFRESH_THRESHOLD = 50 * 60 * 1000; // 50 minutos

    setInterval(() => {
        const ahora = Date.now();
        wss.clients.forEach(client => {
            if (
                client.usuarioIdentificado &&
                client.readyState === Websocket.OPEN &&
                client.iceIssuedAt &&
                (ahora - client.iceIssuedAt) >= ICE_REFRESH_THRESHOLD
            ) {
                enviarIceConfig(client);
            }
        });
    }, 5 * 60 * 1000); // Revisión cada 5 minutos

    wss.on('close', () => {
        clearInterval(interval);
    });
};

