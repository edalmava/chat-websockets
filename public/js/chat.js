/**
 * ORQUESTADOR CENTRAL (GLUE CODE) DEL CHAT
 */

import { obtenerSesion, onCambioEstadoAuth, obtenerToken, iniciarSesion, registrarUsuario, cerrarSesion } from './supabaseClient.js';
import * as wsManager from './wsManager.js';
import * as webrtcManager from './webrtcManager.js';
import * as uiManager from './uiManager.js';

// Estados globales en el orquestador
let miNombreUsuario = '';
let miRol = 'user';
let miUserId = '';
let salaActual = '';
let cerrandoSesion = false;
const usuariosEscribiendo = new Set(); // Guarda los nombres de quienes escriben en el chat público

/**
 * Conecta al servidor de WebSocket
 */
async function conectar() {
    const token = await obtenerToken();
    if (!token) {
        uiManager.mostrarPantallaLogin();
        return;
    }

    uiManager.actualizarStatusUI('Conectando...', 'info');

    wsManager.conectar(token, {
        onOpen: () => {
            uiManager.actualizarStatusUI('Conectado', 'success');
            const salaAUnirse = salaActual || 'General';
            joinChat(salaAUnirse);
        },
        onClose: (event) => {
            webrtcManager.cerrarTodasLasConexionesP2P(getWebRTCCallbacks());

            if (event.code === 4001) {
                uiManager.actualizarStatusUI('No autorizado / Token inválido', 'error');
                logout();
                return;
            }
            if (event.code === 4002) {
                uiManager.actualizarStatusUI('Sesión iniciada en otra ubicación', 'error');
                uiManager.mostrarPantallaLogin();
                uiManager.mostrarErrorAuth('Tu sesión se cerró porque ingresaste desde otra ventana.');
                return;
            }
            if (event.code === 4003) {
                uiManager.actualizarStatusUI('Expulsado de la sala', 'error');
                uiManager.mostrarPantallaLogin();
                uiManager.mostrarErrorAuth('Has sido expulsado del chat por un moderador.');
                return;
            }

            uiManager.actualizarStatusUI('Desconectado', 'error');
        },
        onReconnectionFailed: () => {
            uiManager.mostrarPantallaLogin();
            uiManager.mostrarErrorAuth('No se pudo establecer conexión con el servidor de chat.');
        },
        onMessage: (data) => {
            manejarMensajeServidor(data);
        },
        onError: (err) => {
            console.error('[WS] Error detectado:', err);
        }
    });
}

/**
 * Envía un comando join al servidor
 */
function joinChat(sala) {
    wsManager.enviarMensaje({
        tipo: 'join',
        sala: sala
    });
}

/**
 * Procesa mensajes provenientes del WebSocket
 */
function manejarMensajeServidor(data) {
    if (!data.tipo) return;

    switch (data.tipo) {
        case 'auth-info':
            miRol = data.role;
            miNombreUsuario = data.displayName;
            miUserId = data.userId;
            
            uiManager.actualizarInfoUsuario(miNombreUsuario, miRol, miUserId);
            uiManager.mostrarPantallaChat();
            break;

        case 'join-success':
            const esPrimerIngreso = !salaActual;
            salaActual = data.sala;

            if (esPrimerIngreso) {
                uiManager.mostrarPantallaChat();
            } else {
                uiManager.limpiarMensajesPublicos();
                usuariosEscribiendo.clear();
                uiManager.actualizarIndicadorEscritura(usuariosEscribiendo);
            }
            
            uiManager.actualizarSalaActiva(salaActual);
            break;

        case 'token_refresh_ok':
            miRol = data.role;
            miNombreUsuario = data.displayName;
            uiManager.actualizarInfoUsuario(miNombreUsuario, miRol, miUserId);
            break;

        case 'ice-config':
            webrtcManager.actualizarIceServers(data.config);
            console.log('[WebRTC] Credenciales ICE configuradas.');
            break;

        case 'salas-disponibles':
            uiManager.renderizarSalas(data.salas, salaActual, (sala) => {
                joinChat(sala);
            });
            break;

        case 'lista-usuarios':
            uiManager.actualizarListaUsuarios(data.usuarios, miUserId, miRol, {
                onUserClick: (targetUserId, displayName) => {
                    abrirVentanaP2P(targetUserId, displayName);
                },
                onKickUser: (userId, motivo) => {
                    wsManager.enviarMensaje({
                        tipo: 'kick_user',
                        payload: { userId, motivo }
                    });
                },
                onMuteUser: (userId, duracion) => {
                    wsManager.enviarMensaje({
                        tipo: 'mute_user',
                        payload: { userId, duracion }
                    });
                }
            });
            break;

        case 'user-typing':
            if (data.escribiendo) {
                usuariosEscribiendo.add(data.usuario);
            } else {
                usuariosEscribiendo.delete(data.usuario);
            }
            uiManager.actualizarIndicadorEscritura(usuariosEscribiendo);
            break;

        case 'webrtc-signal':
            webrtcManager.manejarSenalWebRTC(data.de, data.deNombre, data.data, getWebRTCCallbacks());
            break;

        case 'kicked':
            uiManager.renderizarMensajePublico({
                tipo: 'error',
                mensaje: `Fuiste expulsado por el moderador ${data.payload.por}. Motivo: ${data.payload.motivo}`,
                timestamp: new Date().toISOString()
            });
            uiManager.mostrarNotificacion(
                `Has sido expulsado por ${data.payload.por}. Motivo: ${data.payload.motivo}`,
                'error',
                10000
            );
            logout();
            break;

        case 'muted':
            uiManager.renderizarMensajePublico({
                tipo: 'error',
                mensaje: `Fuiste silenciado por el moderador ${data.payload.por} durante ${data.payload.duracion} segundos.`,
                timestamp: new Date().toISOString()
            });
            uiManager.deshabilitarInputChat(data.payload.duracion);
            break;

        case 'rol_actualizado':
            miRol = data.payload.nuevoRol;
            uiManager.actualizarInfoUsuario(miNombreUsuario, miRol, miUserId);
            uiManager.mostrarNotificacion(
                `Tu rol ha sido actualizado a: ${miRol}`,
                'info',
                5000
            );
            break;

        default:
            // Tratar mensajes genéricos de chat, errores o de sistema
            uiManager.renderizarMensajePublico(data);
            break;
    }
}

/**
 * Cierra la sesión del chat y limpia los managers
 */
async function logout() {
    if (cerrandoSesion) return;
    cerrandoSesion = true;
    try {
        await cerrarSesion();
        wsManager.cerrarConexion();
        webrtcManager.cerrarTodasLasConexionesP2P(getWebRTCCallbacks());
        
        miNombreUsuario = '';
        miRol = 'user';
        miUserId = '';
        salaActual = '';
        usuariosEscribiendo.clear();
        
        uiManager.mostrarPantallaLogin();
    } finally {
        cerrandoSesion = false;
    }
}

/**
 * Solicita iniciar una conexión P2P y actualiza la vista
 */
async function abrirVentanaP2P(targetUserId, displayName) {
    const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
    
    if (activeP2PUser !== targetUserId) {
        const p2pConnections = webrtcManager.obtenerP2PConnections();
        
        if (!p2pConnections.has(targetUserId)) {
            await webrtcManager.iniciarConexionP2P(targetUserId, displayName, getWebRTCCallbacks());
        }
        
        const conn = p2pConnections.get(targetUserId);
        if (conn) {
            webrtcManager.establecerUsuarioP2PActivo(targetUserId);
            uiManager.renderizarVentanaP2P(targetUserId, conn);
            uiManager.actualizarSidebarP2P(p2pConnections, targetUserId, getUICallbacks());
            webrtcManager.marcarVistoP2P(targetUserId);
        }
    }
}

/**
 * Retorna los callbacks de eventos de UI para el uiManager
 */
function getUICallbacks() {
    return {
        onLoginSubmit: async (email, password) => {
            uiManager.mostrarCargandoAuth(true);
            uiManager.mostrarErrorAuth('');
            const { data, error } = await iniciarSesion(email, password);
            if (error) {
                uiManager.mostrarErrorAuth(error.message || 'Error al iniciar sesión');
                uiManager.mostrarCargandoAuth(false);
            } else {
                miNombreUsuario = data.user.user_metadata?.display_name || email.split('@')[0];
                miUserId = data.user.id;
                conectar();
            }
        },
        onRegisterSubmit: async (displayName, email, password) => {
            uiManager.mostrarCargandoAuth(true);
            uiManager.mostrarErrorAuth('');
            const { data, error } = await registrarUsuario(email, password, displayName);
            if (error) {
                uiManager.mostrarErrorAuth(error.message || 'Error al crear la cuenta');
                uiManager.mostrarCargandoAuth(false);
            } else {
                uiManager.mostrarCargandoAuth(false);
                if (data.session) {
                    miNombreUsuario = displayName;
                    miUserId = data.user.id;
                    conectar();
                } else {
                    alert('¡Cuenta registrada! Por favor verifica tu bandeja de entrada para confirmar tu correo antes de iniciar sesión.');
                    uiManager.cambiarPestañaAuth('login');
                }
            }
        },
        onLogout: () => {
            logout();
        },
        onPublicMessageSend: (texto) => {
            wsManager.enviarMensaje({
                tipo: 'chat',
                mensaje: texto
            });
        },
        onPublicTyping: (escribiendo) => {
            wsManager.enviarMensaje({
                tipo: 'typing',
                escribiendo: escribiendo
            });
        },
        onP2PMessageSend: (texto) => {
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            if (activeP2PUser) {
                const msg = webrtcManager.enviarMensajeChatP2P(activeP2PUser, texto);
                if (msg) {
                    uiManager.mostrarMensajeEnVentana('Tú', texto, 'me', msg.time);
                }
            }
        },
        onP2PTyping: (escribiendo) => {
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            if (activeP2PUser) {
                webrtcManager.notificarEscrituraP2P(activeP2PUser, escribiendo);
            }
        },
        onP2PClose: () => {
            webrtcManager.establecerUsuarioP2PActivo(null);
            const p2pConnections = webrtcManager.obtenerP2PConnections();
            uiManager.actualizarSidebarP2P(p2pConnections, null, getUICallbacks());
        },
        onP2PChannelClick: (targetUserId) => {
            const p2pConnections = webrtcManager.obtenerP2PConnections();
            const conn = p2pConnections.get(targetUserId);
            if (conn) {
                webrtcManager.establecerUsuarioP2PActivo(targetUserId);
                uiManager.renderizarVentanaP2P(targetUserId, conn);
                uiManager.actualizarSidebarP2P(p2pConnections, targetUserId, getUICallbacks());
                webrtcManager.marcarVistoP2P(targetUserId);
            }
        },
        onAdminChangeRole: (targetUserId, nuevoRol) => {
            wsManager.enviarMensaje({
                tipo: 'cambiar_rol',
                payload: { userId: targetUserId, nuevoRol }
            });
        }
    };
}

/**
 * Retorna los callbacks de eventos de WebRTC para webrtcManager
 */
function getWebRTCCallbacks() {
    return {
        onSendSignal: (para, data) => {
            wsManager.enviarMensaje({
                tipo: 'webrtc-signal',
                para,
                data
            });
        },
        onP2PConnectionOpened: (targetUserId) => {
            const p2pConnections = webrtcManager.obtenerP2PConnections();
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            uiManager.actualizarSidebarP2P(p2pConnections, activeP2PUser, getUICallbacks());
            if (activeP2PUser === targetUserId) {
                webrtcManager.marcarVistoP2P(targetUserId);
            }
        },
        onP2PConnectionClosed: (targetUserId, displayName, motivo) => {
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            if (activeP2PUser === targetUserId || activeP2PUser === null) {
                uiManager.deshabilitarUIModalP2P(motivo);
            }
            const p2pConnections = webrtcManager.obtenerP2PConnections();
            uiManager.actualizarSidebarP2P(p2pConnections, activeP2PUser, getUICallbacks());
        },
        onP2PStatusChanged: (targetUserId, status, typing) => {
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            if (activeP2PUser === targetUserId) {
                const p2pConnections = webrtcManager.obtenerP2PConnections();
                const conn = p2pConnections.get(targetUserId);
                if (conn) {
                    uiManager.actualizarP2PUI(targetUserId, conn);
                }
            }
        },
        onP2PMessageReceived: (deUserId, displayName, texto, time, clase) => {
            uiManager.mostrarMensajeEnVentana(displayName, texto, clase, time);
        },
        onP2PUnreadIncremented: (deUserId) => {
            const p2pConnections = webrtcManager.obtenerP2PConnections();
            const activeP2PUser = webrtcManager.obtenerUsuarioP2PActivo();
            uiManager.actualizarSidebarP2P(p2pConnections, activeP2PUser, getUICallbacks());
        },
        onP2PMessageSeen: (deUserId) => {
            uiManager.actualizarVistoP2P();
        },
        onShowInvitation: (deUserId, deNombre, senal) => {
            uiManager.mostrarToastInvitacion(deUserId, deNombre, senal, 
                // Aceptar
                async (deId, s) => {
                    await webrtcManager.aceptarInvitacionP2P(deId, s, getWebRTCCallbacks());
                    const p2pConnections = webrtcManager.obtenerP2PConnections();
                    const conn = p2pConnections.get(deId);
                    if (conn) {
                        webrtcManager.establecerUsuarioP2PActivo(deId);
                        uiManager.renderizarVentanaP2P(deId, conn);
                        uiManager.actualizarSidebarP2P(p2pConnections, deId, getUICallbacks());
                        webrtcManager.marcarVistoP2P(deId);
                    }
                },
                // Rechazar
                (deId) => {
                    webrtcManager.cerrarConexionP2P(deId, 'Invitación rechazada', getWebRTCCallbacks());
                }
            );
        }
    };
}

/**
 * Inicialización al cargar la página
 */
async function inicializarApp() {
    // 1. Configurar listeners de la interfaz
    uiManager.inicializarUI(getUICallbacks());

    // 2. Comprobar sesión de Supabase Auth
    try {
        const session = await obtenerSesion();
        if (session) {
            miNombreUsuario = session.user.user_metadata?.display_name || session.user.email.split('@')[0];
            miUserId = session.user.id;
            conectar();
        } else {
            uiManager.mostrarPantallaLogin();
        }
    } catch (e) {
        console.error('Error al inicializar app:', e);
        uiManager.mostrarPantallaLogin();
    }

    // 3. Suscribirse a cambios en el estado de Auth
    onCambioEstadoAuth((event, session) => {
        const socketState = wsManager.obtenerEstadoSocket();
        
        if (event === 'TOKEN_REFRESHED' && socketState === WebSocket.OPEN) {
            wsManager.enviarMensaje({
                tipo: 'token_refresh',
                token: session.access_token
            });
        }
        if (event === 'SIGNED_OUT') {
            logout();
        }
    });
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', inicializarApp);
