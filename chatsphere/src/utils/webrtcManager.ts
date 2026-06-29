/**
 * GESTOR DE CONEXIONES P2P (WEBRTC - TypeScript)
 */

export interface P2PConnection {
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
    displayName: string;
    messages: { de: string; texto: string; time: Date }[];
    unread: number;
    status: string;
    candidateBuffer: any[];
    typing?: boolean;
}

export interface WebRTCCallbacks {
    onSendSignal?: (para: string, data: any) => void;
    onP2PConnectionOpened?: (targetUserId: string) => void;
    onP2PConnectionClosed?: (targetUserId: string, displayName: string, motivo: string) => void;
    onP2PStatusChanged?: (targetUserId: string, status: string, typing?: boolean) => void;
    onP2PMessageReceived?: (deUserId: string, displayName: string, texto: string, time: Date, clase: 'me' | 'them') => void;
    onP2PUnreadIncremented?: (deUserId: string) => void;
    onP2PMessageSeen?: (deUserId: string) => void;
    onShowInvitation?: (deUserId: string, deNombre: string, senal: any) => void;
    // Media call callbacks
    onMediaCallReceived?: (deUserId: string, deNombre: string, tipo: 'video' | 'voice') => void;
    onMediaCallAccepted?: (deUserId: string) => void;
    onMediaCallRejected?: (deUserId: string) => void;
    onMediaCallEnded?: (deUserId: string, reason: string) => void;
    onRemoteStreamAdded?: (stream: MediaStream) => void;
    onLocalStreamAdded?: (stream: MediaStream) => void;
}

const p2pManager = new Map<string, P2PConnection>();
const MAX_ICE_CANDIDATES = 50; // Límite de candidatos ICE para evitar DoS por memoria
const MAX_P2P_CONNECTIONS = 10; // Máximo de conexiones P2P simultáneas por cliente
const MAX_P2P_MESSAGE_LENGTH = 5000; // Máximo de caracteres por mensaje P2P
let activeP2PUser: string | null = null; // targetUserId actual de la ventana activa
let p2pEstaEscribiendo = false;
let p2pTypingTimeout: NodeJS.Timeout | null = null;

let iceServers: RTCConfiguration | null = null;
let iceConfigReady: Promise<RTCConfiguration> | null = null;
let resolveIceConfig: ((value: RTCConfiguration) => void) | null = null;

// --- Media Call State ---
export type CallState = 'idle' | 'ringing' | 'calling' | 'connected' | 'ended';
let mediaCallState: CallState = 'idle';
let mediaCallType: 'video' | 'voice' | null = null;
let mediaTargetUserId: string | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
// Ringtone
let audioCtx: AudioContext | null = null;
let oscGain: GainNode | null = null;
let oscNode: OscillatorNode | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Retorna una promesa que se resuelve cuando las credenciales ICE/STUN/TURN están disponibles
 */
export function esperarIceConfig(): Promise<RTCConfiguration> {
    if (iceServers) return Promise.resolve(iceServers);
    if (!iceConfigReady) {
        iceConfigReady = new Promise<RTCConfiguration>(resolve => {
            resolveIceConfig = resolve;
        });
    }
    return iceConfigReady;
}

/**
 * Guarda los servidores ICE provistos por el servidor WebSocket
 */
export function actualizarIceServers(servers: RTCConfiguration) {
    iceServers = servers;
    if (resolveIceConfig) {
        resolveIceConfig(iceServers);
        resolveIceConfig = null;
    }
}

/**
 * Retorna el mapa completo de conexiones P2P activas
 */
export function obtenerP2PConnections(): Map<string, P2PConnection> {
    return p2pManager;
}

/**
 * Retorna el UUID del usuario P2P activo actual
 */
export function obtenerUsuarioP2PActivo(): string | null {
    return activeP2PUser;
}

/**
 * Establece el usuario P2P activo actual
 */
export function establecerUsuarioP2PActivo(userId: string | null) {
    activeP2PUser = userId;
    if (userId) {
        const conn = p2pManager.get(userId);
        if (conn) {
            conn.unread = 0;
        }
    }
}

/**
 * Inicia una nueva conexión PeerConnection (WebRTC) como emisor (Offer)
 */
export async function iniciarConexionP2P(targetUserId: string, displayName: string, callbacks: WebRTCCallbacks = {}) {
    if (p2pManager.has(targetUserId)) {
        cerrarConexionP2P(targetUserId, 'Reiniciando conexión', callbacks);
    }

    if (p2pManager.size >= MAX_P2P_CONNECTIONS) {
        console.warn(`[WebRTC] Límite de ${MAX_P2P_CONNECTIONS} conexiones P2P alcanzado`);
        return;
    }

    console.log(`[WebRTC] Iniciando conexión con: ${displayName} (${targetUserId})`);

    const config = await esperarIceConfig();
    const pc = new RTCPeerConnection(config);

    const connection: P2PConnection = { 
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
function configurarPC(targetUserId: string, pc: RTCPeerConnection, callbacks: WebRTCCallbacks) {
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

    pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
            remoteStream = e.streams[0];
            if (callbacks.onRemoteStreamAdded) {
                callbacks.onRemoteStreamAdded(e.streams[0]);
            }
        }
    };
}

/**
 * Configura los eventos del DataChannel
 */
function configurarDC(targetUserId: string, dc: RTCDataChannel, callbacks: WebRTCCallbacks) {
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
export async function manejarSenalWebRTC(de: string, deNombre: string, senal: any, callbacks: WebRTCCallbacks = {}) {
    // Si es una oferta entrante, mostramos invitación (limpiando conexión previa si existía)
    if (senal.tipo === 'offer') {
        if (p2pManager.has(de)) {
            cerrarConexionP2P(de, 'Nueva oferta entrante', callbacks);
        }
        if (p2pManager.size >= MAX_P2P_CONNECTIONS) {
            console.warn(`[WebRTC] Límite de ${MAX_P2P_CONNECTIONS} conexiones P2P alcanzado, oferta de ${deNombre} rechazada`);
            return;
        }
        const config = await esperarIceConfig();
        const pc = new RTCPeerConnection(config);
        const connection: P2PConnection = { 
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
            await conn.pc.setRemoteDescription(senal.sdp);
            await vaciarBufferCandidatos(de);
        } else if (senal.tipo === 'candidate') {
            if (!conn.pc.remoteDescription) {
                if (conn.candidateBuffer.length >= MAX_ICE_CANDIDATES) {
                    return; // Ignorar candidatos excedentes
                }
                conn.candidateBuffer.push(senal.candidate);
            } else {
                await conn.pc.addIceCandidate(senal.candidate);
            }
        }
    } catch (err) {
        console.error(`[WebRTC] Error procesando señal de ${deNombre}:`, err);
    }
}

/**
 * Acepta una invitación de conexión WebRTC
 */
export async function aceptarInvitacionP2P(deUserId: string, senal: any, callbacks: WebRTCCallbacks = {}) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    try {
        await conn.pc.setRemoteDescription(senal.sdp);
        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);

        if (callbacks.onSendSignal) {
            callbacks.onSendSignal(deUserId, { tipo: 'answer', sdp: answer });
        }

        await vaciarBufferCandidatos(deUserId);
    } catch (err) {
        console.error('[WebRTC] Error al aceptar invitación:', err);
        cerrarConexionP2P(deUserId, 'Error en el acuerdo de conexión', callbacks);
    }
}

/**
 * Vacia el buffer temporal de candidatos ICE acumulados
 */
async function vaciarBufferCandidatos(targetUserId: string) {
    const conn = p2pManager.get(targetUserId);
    if (!conn || !conn.candidateBuffer.length) return;

    for (const cand of conn.candidateBuffer) {
        try {
            await conn.pc.addIceCandidate(cand);
        } catch (e) {
            console.warn(`[WebRTC] Error al vaciar candidato del buffer`, e);
        }
    }
    conn.candidateBuffer = [];
}

/**
 * Envía un mensaje estructurado por DataChannel
 */
function enviarPorDC(targetUserId: string, tipo: string, payload: any) {
    const conn = p2pManager.get(targetUserId);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
        conn.dc.send(JSON.stringify({
            tipo,
            payload,
            timestamp: Date.now(),
            id: Math.random().toString(36).substring(2, 11)
        }));
        return true;
    }
    return false;
}

/**
 * Envía un mensaje de chat privado P2P
 */
export function enviarMensajeChatP2P(targetUserId: string, texto: string) {
    if (typeof texto !== 'string' || texto.length > MAX_P2P_MESSAGE_LENGTH) {
        console.warn(`[WebRTC] Mensaje P2P saliente excede el límite de ${MAX_P2P_MESSAGE_LENGTH} caracteres`);
        return null;
    }
    const enviado = enviarPorDC(targetUserId, 'chat', texto);
    if (enviado) {
        const conn = p2pManager.get(targetUserId);
        if (conn) {
            const msg = { de: 'Tú', texto, time: new Date() };
            conn.messages.push(msg);
            
            if (p2pEstaEscribiendo) {
                p2pEstaEscribiendo = false;
                enviarPorDC(targetUserId, 'typing', { escribiendo: false });
            }
            return msg;
        }
    }
    return null;
}

/**
 * Procesa mensajes de datos entrantes a través del DataChannel
 */
function recibirMensajeP2P(deUserId: string, dataRaw: string, callbacks: WebRTCCallbacks) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    try {
        const data = JSON.parse(dataRaw);
        const time = data.timestamp ? new Date(data.timestamp) : new Date();

        switch (data.tipo) {
            case 'chat':
                if (typeof data.payload !== 'string' || data.payload.length > MAX_P2P_MESSAGE_LENGTH) {
                    console.warn(`[WebRTC] Mensaje P2P de ${conn.displayName} excede el límite de ${MAX_P2P_MESSAGE_LENGTH} caracteres`);
                    return;
                }
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

            // Media call messages (via DataChannel)
            case 'media-offer':
            case 'media-answer':
            case 'media-reject':
            case 'media-end':
                manejarMensajeMedia(deUserId, data, callbacks);
                break;
        }
    } catch (e) {
        console.error('[WebRTC] Error al procesar mensaje P2P de entrada:', e);
    }
}

/**
 * Notifica si estamos escribiendo en la ventana activa P2P
 */
export function notificarEscrituraP2P(targetUserId: string, escribiendo: boolean) {
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
export function marcarVistoP2P(targetUserId: string) {
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
export function cerrarConexionP2P(targetUserId: string, motivo = 'Conexión cerrada', callbacks: WebRTCCallbacks = {}) {
    const conn = p2pManager.get(targetUserId);
    if (!conn) return;

    if (targetUserId === mediaTargetUserId) {
        finalizarLlamadaMedia(callbacks);
    }

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
export function cerrarTodasLasConexionesP2P(callbacks: WebRTCCallbacks = {}) {
    p2pManager.forEach((_, targetUserId) => {
        cerrarConexionP2P(targetUserId, 'Sesión cerrada', callbacks);
    });
    finalizarLlamadaMedia(callbacks);
}

// ===================== MEDIA CALL (VIDEO / VOICE) =====================

function iniciarTonoLlamada() {
    if (audioCtx) return;
    try {
        audioCtx = new AudioContext();
        oscGain = audioCtx.createGain();
        oscGain.gain.value = 0.3;
        oscGain.connect(audioCtx.destination);

        const tocar = () => {
            if (!audioCtx || !oscGain) return;
            oscNode = audioCtx.createOscillator();
            oscNode.type = 'sine';
            oscNode.frequency.value = 440;
            oscNode.connect(oscGain);
            oscNode.start();
            oscNode.stop(audioCtx.currentTime + 1);
        };

        const silenciar = () => {
            if (oscNode) {
                try { oscNode.stop(); } catch (_) { /* ignore */ }
                oscNode = null;
            }
        };

        tocar();
        ringInterval = setInterval(() => {
            if (!audioCtx) return;
            silenciar();
            setTimeout(tocar, 1000);
        }, 2000);
    } catch (_) { /* audio not available */ }
}

function detenerTonoLlamada() {
    if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    if (oscNode) { try { oscNode.stop(); } catch (_) { /* ignore */ } oscNode = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    oscGain = null;
}

export function obtenerEstadoLlamada(): { state: CallState; type: 'video' | 'voice' | null; targetUserId: string | null } {
    return { state: mediaCallState, type: mediaCallType, targetUserId: mediaTargetUserId };
}

export function obtenerStreamLocal(): MediaStream | null {
    return localStream;
}

export function obtenerStreamRemoto(): MediaStream | null {
    return remoteStream;
}

export function estaEnLlamada(): boolean {
    return mediaCallState === 'connected' || mediaCallState === 'calling' || mediaCallState === 'ringing';
}

/**
 * Inicia una llamada de video o voz hacia un usuario (debe haber DataChannel abierto)
 */
export async function iniciarLlamadaMedia(targetUserId: string, tipo: 'video' | 'voice', callbacks: WebRTCCallbacks = {}) {
    if (mediaCallState !== 'idle') {
        console.warn('[WebRTC] Ya hay una llamada en curso');
        return;
    }

    const conn = p2pManager.get(targetUserId);
    if (!conn || !conn.dc || conn.dc.readyState !== 'open') {
        console.warn('[WebRTC] No hay DataChannel abierto para iniciar llamada');
        return;
    }

    mediaCallState = 'calling';
    mediaCallType = tipo;
    mediaTargetUserId = targetUserId;

    try {
        const constraints: MediaStreamConstraints = tipo === 'video'
            ? { video: true, audio: true }
            : { video: false, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStream = stream;

        if (callbacks.onLocalStreamAdded) {
            callbacks.onLocalStreamAdded(stream);
        }

        for (const track of stream.getTracks()) {
            conn.pc.addTrack(track, stream);
        }

        const offer = await conn.pc.createOffer({ iceRestart: false });
        await conn.pc.setLocalDescription(offer);

        enviarPorDC(targetUserId, 'media-offer', {
            sdp: offer,
            mediaType: tipo
        });
    } catch (err) {
        console.error('[WebRTC] Error al iniciar llamada:', err);
        mediaCallState = 'idle';
        mediaCallType = null;
        mediaTargetUserId = null;
        limpiarStreamLocal();
        if (callbacks.onMediaCallEnded) {
            callbacks.onMediaCallEnded(targetUserId, 'Error al obtener dispositivos');
        }
    }
}

/**
 * Acepta una llamada entrante
 */
export async function aceptarLlamadaMedia(targetUserId: string, callbacks: WebRTCCallbacks = {}) {
    const conn = p2pManager.get(targetUserId);
    if (!conn || !conn.dc || conn.dc.readyState !== 'open') return;

    detenerTonoLlamada();

    const pendingOffer = (conn as any)._pendingOffer;
    if (!pendingOffer) {
        console.warn('[WebRTC] No hay oferta pendiente para aceptar');
        return;
    }

    try {
        await conn.pc.setRemoteDescription(pendingOffer);
        delete (conn as any)._pendingOffer;

        const tipo = mediaCallType || 'voice';
        const constraints: MediaStreamConstraints = tipo === 'video'
            ? { video: true, audio: true }
            : { video: false, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStream = stream;

        if (callbacks.onLocalStreamAdded) {
            callbacks.onLocalStreamAdded(stream);
        }

        for (const track of stream.getTracks()) {
            conn.pc.addTrack(track, stream);
        }

        const answer = await conn.pc.createAnswer();
        await conn.pc.setLocalDescription(answer);

        mediaCallState = 'connected';

        enviarPorDC(targetUserId, 'media-answer', { sdp: answer });
    } catch (err) {
        console.error('[WebRTC] Error al aceptar llamada:', err);
        finalizarLlamadaMedia(callbacks);
    }
}

/**
 * Envía media-offer al target y marca ringing antes de aceptar.
 * Se llama desde el callback onMediaCallReceived para que el store
 * pueda cambiar estado a 'ringing' ANTES de que el usuario conteste.
 */
export function recibirOfertaMedia(deUserId: string, sdp: any, mediaType: 'video' | 'voice', callbacks: WebRTCCallbacks) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    (conn as any)._pendingOffer = new RTCSessionDescription(sdp);

    mediaCallState = 'ringing';
    mediaCallType = mediaType;
    mediaTargetUserId = deUserId;

    iniciarTonoLlamada();
}

/**
 * Rechaza una llamada entrante
 */
export function rechazarLlamadaMedia(targetUserId: string, callbacks: WebRTCCallbacks = {}) {
    detenerTonoLlamada();
    enviarPorDC(targetUserId, 'media-reject', {});
    const conn = p2pManager.get(targetUserId);
    if (conn) {
        delete (conn as any)._pendingOffer;
    }
    mediaCallState = 'idle';
    mediaCallType = null;
    mediaTargetUserId = null;
}

/**
 * Finaliza la llamada activa
 */
export function finalizarLlamadaMedia(callbacks: WebRTCCallbacks = {}) {
    if (mediaCallState === 'idle') return;

    const targetUserId = mediaTargetUserId;
    detenerTonoLlamada();

    if (targetUserId) {
        enviarPorDC(targetUserId, 'media-end', { reason: 'user-hangup' });
    }

    // Remover senders de media del PC
    if (targetUserId) {
        const conn = p2pManager.get(targetUserId);
        if (conn && conn.pc && conn.pc.connectionState !== 'closed') {
            const senders = conn.pc.getSenders();
            for (const s of senders) {
                if (s.track && (s.track.kind === 'video' || s.track.kind === 'audio')) {
                    try { conn.pc.removeTrack(s); } catch (_) { /* ignore */ }
                }
            }
        }
    }

    limpiarStreamLocal();
    limpiarStreamRemoto();

    if (targetUserId && callbacks.onMediaCallEnded) {
        callbacks.onMediaCallEnded(targetUserId, 'user-hangup');
    }

    mediaCallState = 'idle';
    mediaCallType = null;
    mediaTargetUserId = null;
}

function limpiarStreamLocal() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
}

function limpiarStreamRemoto() {
    remoteStream = null;
}

export function alternarMicrofono(activo: boolean) {
    if (localStream) {
        localStream.getAudioTracks().forEach(t => { t.enabled = activo; });
    }
}

export function alternarCamara(activo: boolean) {
    if (localStream) {
        localStream.getVideoTracks().forEach(t => { t.enabled = activo; });
    }
}

/**
 * Procesa los mensajes de media que llegan por DataChannel (desde recibirMensajeP2P)
 */
export function manejarMensajeMedia(deUserId: string, data: any, callbacks: WebRTCCallbacks) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    switch (data.tipo) {
        case 'media-offer': {
            const sdp = data.payload?.sdp;
            const mediaType = data.payload?.mediaType || 'voice';
            if (!sdp) return;

            if (mediaCallState !== 'idle') {
                enviarPorDC(deUserId, 'media-reject', { reason: 'busy' });
                return;
            }

            recibirOfertaMedia(deUserId, sdp, mediaType, callbacks);

            const conn2 = p2pManager.get(deUserId);
            if (conn2 && callbacks.onMediaCallReceived) {
                callbacks.onMediaCallReceived(deUserId, conn2.displayName, mediaType);
            }
            break;
        }

        case 'media-answer': {
            const answerSdp = data.payload?.sdp;
            if (!answerSdp) return;

            conn.pc.setRemoteDescription(new RTCSessionDescription(answerSdp)).catch(err => {
                console.error('[WebRTC] Error al setRemoteDescription (media-answer):', err);
            });

            if (callbacks.onMediaCallAccepted) {
                callbacks.onMediaCallAccepted(deUserId);
            }
            break;
        }

        case 'media-reject': {
            detenerTonoLlamada();
            if (callbacks.onMediaCallRejected) {
                callbacks.onMediaCallRejected(deUserId);
            }
            finalizarLlamadaMedia(callbacks);
            break;
        }

        case 'media-end': {
            if (callbacks.onMediaCallEnded) {
                callbacks.onMediaCallEnded(deUserId, data.payload?.reason || 'remote-hangup');
            }
            detenerTonoLlamada();
            limpiarStreamRemoto();
            mediaCallState = 'idle';
            mediaCallType = null;
            mediaTargetUserId = null;
            break;
        }
    }
}
