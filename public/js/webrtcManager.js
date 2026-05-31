/**
 * GESTOR DE CONEXIONES P2P (WEBRTC)
 */

const p2pManager = new Map(); // Map<targetUserId, { pc, dc, displayName, messages, unread, status, candidateBuffer }>
const MAX_ICE_CANDIDATES = 50; // #4: Límite de candidatos ICE para evitar DoS por memoria
let activeP2PUser = null; // targetUserId actual de la ventana activa
let p2pEstaEscribiendo = false;
let p2pTypingTimeout = null;

let iceServers = null;
let iceConfigReady = null;
let resolveIceConfig = null;

/**
 * Retorna una promesa que se resuelve cuando las credenciales ICE/STUN/TURN están disponibles
 */
export function esperarIceConfig() {
    if (iceServers) return Promise.resolve(iceServers);
    if (!iceConfigReady) {
        iceConfigReady = new Promise(resolve => {
            resolveIceConfig = resolve;
        });
    }
    return iceConfigReady;
}

/**
 * Guarda los servidores ICE provistos por el servidor WebSocket
 */
export function actualizarIceServers(servers) {
    iceServers = servers;
    if (resolveIceConfig) {
        resolveIceConfig(iceServers);
        resolveIceConfig = null;
    }
}

/**
 * Retorna el mapa completo de conexiones P2P activas
 */
export function obtenerP2PConnections() {
    return p2pManager;
}

/**
 * Retorna el UUID del usuario P2P activo actual
 */
export function obtenerUsuarioP2PActivo() {
    return activeP2PUser;
}

/**
 * Establece el usuario P2P activo actual
 */
export function establecerUsuarioP2PActivo(userId) {
    activeP2PUser = userId;
    const conn = p2pManager.get(userId);
    if (conn) {
        conn.unread = 0;
    }
}

/**
 * Inicia una nueva conexión PeerConnection (WebRTC) como emisor (Offer)
 */
export async function iniciarConexionP2P(targetUserId, displayName, callbacks = {}) {
    console.log(`[WebRTC] Iniciando conexión con: ${displayName} (${targetUserId})`);

    const config = await esperarIceConfig();
    const pc = new RTCPeerConnection(config);

    const connection = { 
        pc, 
        dc: null, 
        displayName, 
        messages: [], 
        unread: 0, 
        status: 'Conectando...', 
        candidateBuffer: [] 
    };
    p2pManager.set(targetUserId, connection);

    configurarPC(targetUserId, pc, callbacks);
    
    const dc = pc.createDataChannel('chat');
    connection.dc = dc;
    configurarDC(targetUserId, dc, callbacks);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        if (callbacks.onSendSignal) {
            callbacks.onSendSignal(targetUserId, { tipo: 'offer', sdp: offer });
        }
    } catch (err) {
        console.error(`[WebRTC] Error al crear oferta:`, err);
    }
}

/**
 * Configura los eventos del RTCPeerConnection
 */
function configurarPC(targetUserId, pc, callbacks) {
    pc.onicecandidate = (e) => {
        if (e.candidate && callbacks.onSendSignal) {
            callbacks.onSendSignal(targetUserId, { tipo: 'candidate', candidate: e.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        const conn = p2pManager.get(targetUserId);
        if (!conn) return;

        conn.status = pc.connectionState;

        if (callbacks.onP2PStatusChanged) {
            callbacks.onP2PStatusChanged(targetUserId, pc.connectionState, conn.typing);
        }

        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            const motivo = pc.connectionState === 'failed'
                ? 'Conexión WebRTC fallida'
                : `${conn.displayName} se ha desconectado`;
            cerrarConexionP2P(targetUserId, motivo, callbacks);
        }
    };

    pc.ondatachannel = (e) => {
        const conn = p2pManager.get(targetUserId);
        if (conn) {
            conn.dc = e.channel;
            configurarDC(targetUserId, e.channel, callbacks);
        }
    };
}

/**
 * Configura los eventos del DataChannel
 */
function configurarDC(targetUserId, dc, callbacks) {
    dc.onopen = () => {
        const conn = p2pManager.get(targetUserId);
        if (conn) {
            conn.status = 'connected';
            if (callbacks.onP2PStatusChanged) {
                callbacks.onP2PStatusChanged(targetUserId, 'connected', conn.typing);
            }
        }
        if (callbacks.onP2PConnectionOpened) {
            callbacks.onP2PConnectionOpened(targetUserId);
        }
    };

    dc.onclose = () => {
        cerrarConexionP2P(targetUserId, 'Canal de datos cerrado', callbacks);
    };

    dc.onmessage = (e) => recibirMensajeP2P(targetUserId, e.data, callbacks);
}

/**
 * Procesa una señalización WebRTC proveniente del servidor WebSocket (Offer, Answer, Candidates)
 */
export async function manejarSenalWebRTC(de, deNombre, senal, callbacks = {}) {
    // Si es una oferta entrante y no tenemos conexión previa, mostramos invitación
    if (senal.tipo === 'offer' && !p2pManager.has(de)) {
        const config = await esperarIceConfig();
        const pc = new RTCPeerConnection(config);
        const connection = { 
            pc, 
            dc: null, 
            displayName: deNombre, 
            messages: [], 
            unread: 0, 
            status: 'Esperando...', 
            candidateBuffer: [] 
        };
        p2pManager.set(de, connection);
        configurarPC(de, pc, callbacks);

        if (callbacks.onShowInvitation) {
            callbacks.onShowInvitation(de, deNombre, senal);
        }
        return;
    }

    const conn = p2pManager.get(de);
    if (!conn) return;

    try {
        if (senal.tipo === 'answer') {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
            await vaciarBufferCandidatos(de);
        } else if (senal.tipo === 'candidate') {
            if (!conn.pc.remoteDescription) {
                if (conn.candidateBuffer.length >= MAX_ICE_CANDIDATES) {
                    return; // #4: Ignorar candidatos excedentes
                }
                conn.candidateBuffer.push(senal.candidate);
            } else {
                await conn.pc.addIceCandidate(new RTCIceCandidate(senal.candidate));
            }
        }
    } catch (err) {
        console.error(`[WebRTC] Error procesando señal de ${deNombre}:`, err);
    }
}

/**
 * Acepta una invitación de conexión WebRTC
 */
export async function aceptarInvitacionP2P(deUserId, senal, callbacks = {}) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    try {
        await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);

        if (callbacks.onSendSignal) {
            callbacks.onSendSignal(deUserId, { tipo: 'answer', sdp: answer });
        }

        await vaciarBufferCandidatos(deUserId);
        
        if (callbacks.onP2PConnectionOpened) {
            callbacks.onP2PConnectionOpened(deUserId);
        }
    } catch (err) {
        console.error('[WebRTC] Error al aceptar invitación:', err);
        cerrarConexionP2P(deUserId, 'Error en el acuerdo de conexión', callbacks);
    }
}

/**
 * Vacia el buffer temporal de candidatos ICE acumulados
 */
async function vaciarBufferCandidatos(targetUserId) {
    const conn = p2pManager.get(targetUserId);
    if (!conn || !conn.candidateBuffer.length) return;

    for (const cand of conn.candidateBuffer) {
        try {
            await conn.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
            console.warn(`[WebRTC] Error al vaciar candidato del buffer`, e);
        }
    }
    conn.candidateBuffer = [];
}

/**
 * Envía un mensaje estructurado por DataChannel
 */
function enviarPorDC(targetUserId, tipo, payload) {
    const conn = p2pManager.get(targetUserId);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
        conn.dc.send(JSON.stringify({
            tipo,
            payload,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9)
        }));
        return true;
    }
    return false;
}

/**
 * Envía un mensaje de chat privado P2P
 */
export function enviarMensajeChatP2P(targetUserId, texto) {
    const enviado = enviarPorDC(targetUserId, 'chat', texto);
    if (enviado) {
        const conn = p2pManager.get(targetUserId);
        const msg = { de: 'Tú', texto, time: new Date() };
        conn.messages.push(msg);
        
        if (p2pEstaEscribiendo) {
            p2pEstaEscribiendo = false;
            enviarPorDC(targetUserId, 'typing', { escribiendo: false });
        }
        return msg;
    }
    return null;
}

/**
 * Procesa mensajes de datos entrantes a través del DataChannel
 */
function recibirMensajeP2P(deUserId, dataRaw, callbacks) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    try {
        const data = JSON.parse(dataRaw);
        const time = data.timestamp ? new Date(data.timestamp) : new Date();

        switch (data.tipo) {
            case 'chat':
                conn.messages.push({ de: conn.displayName, texto: data.payload, time });
                
                if (activeP2PUser === deUserId) {
                    enviarPorDC(deUserId, 'seen', { id: data.id });
                    if (callbacks.onP2PMessageReceived) {
                        callbacks.onP2PMessageReceived(deUserId, conn.displayName, data.payload, time, 'them');
                    }
                } else {
                    conn.unread++;
                    if (callbacks.onP2PUnreadIncremented) {
                        callbacks.onP2PUnreadIncremented(deUserId);
                    }
                }
                break;

            case 'typing':
                conn.typing = data.payload.escribiendo;
                if (callbacks.onP2PStatusChanged) {
                    callbacks.onP2PStatusChanged(deUserId, conn.pc.connectionState, conn.typing);
                }
                break;

            case 'seen':
                const ultimoMsg = conn.messages.filter(m => m.de === 'Tú').pop();
                if (ultimoMsg && activeP2PUser === deUserId && callbacks.onP2PMessageSeen) {
                    callbacks.onP2PMessageSeen(deUserId);
                }
                break;
        }
    } catch (e) {
        console.error('[WebRTC] Error al procesar mensaje P2P de entrada:', e);
    }
}

/**
 * Notifica si estamos escribiendo en la ventana activa P2P
 */
export function notificarEscrituraP2P(targetUserId, escribiendo) {
    if (activeP2PUser !== targetUserId) return;

    if (escribiendo) {
        if (!p2pEstaEscribiendo) {
            p2pEstaEscribiendo = true;
            enviarPorDC(targetUserId, 'typing', { escribiendo: true });
        }
        
        if (p2pTypingTimeout) clearTimeout(p2pTypingTimeout);
        p2pTypingTimeout = setTimeout(() => {
            p2pEstaEscribiendo = false;
            enviarPorDC(targetUserId, 'typing', { escribiendo: false });
        }, 3000);
    } else {
        if (p2pEstaEscribiendo) {
            p2pEstaEscribiendo = false;
            if (p2pTypingTimeout) clearTimeout(p2pTypingTimeout);
            enviarPorDC(targetUserId, 'typing', { escribiendo: false });
        }
    }
}

/**
 * Envía la confirmación de visto (seen) para todos los mensajes recibidos
 */
export function marcarVistoP2P(targetUserId) {
    const conn = p2pManager.get(targetUserId);
    if (!conn) return;

    const ultimoRecibido = conn.messages.filter(m => m.de !== 'Tú').pop();
    if (ultimoRecibido) {
        enviarPorDC(targetUserId, 'seen', { id: 'all' });
    }
}

/**
 * Cierra la conexión P2P con un usuario
 */
export function cerrarConexionP2P(targetUserId, motivo = 'Conexión cerrada', callbacks = {}) {
    const conn = p2pManager.get(targetUserId);
    if (!conn) return;

    if (conn.dc && conn.dc.readyState !== 'closed') {
        conn.dc.close();
    }
    if (conn.pc && conn.pc.connectionState !== 'closed') {
        conn.pc.close();
    }

    p2pManager.delete(targetUserId);

    if (activeP2PUser === targetUserId) {
        activeP2PUser = null;
    }

    if (callbacks.onP2PConnectionClosed) {
        callbacks.onP2PConnectionClosed(targetUserId, conn.displayName, motivo);
    }
}

/**
 * Cierra absolutamente todas las conexiones P2P activas
 */
export function cerrarTodasLasConexionesP2P(callbacks = {}) {
    p2pManager.forEach((conn, targetUserId) => {
        cerrarConexionP2P(targetUserId, 'Sesión cerrada', callbacks);
    });
}
