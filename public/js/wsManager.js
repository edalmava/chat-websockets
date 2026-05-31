/**
 * GESTOR DE LA CONEXIÓN WEBSOCKET
 */

import { CONFIG } from './config.js';

let socket = null;
let reintentosConexion = 0;
const MAX_REINTENTOS = 5;
let reconexionTimeout = null;
let cierreIntencional = false;

function obtenerUrlServer() {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev ? `ws://localhost:${CONFIG.WS_PORT || 8443}` : 'wss://chat.colsaba.site';
}

/**
 * Conecta al servidor WebSocket.
 * @param {string} token - Token JWT de Supabase.
 * @param {object} handlers - Callbacks para eventos: { onOpen, onClose, onMessage, onError }
 */
export function conectar(token, handlers = {}) {
    if (socket) {
        cierreIntencional = true;
        socket.close();
    }
    
    cierreIntencional = false;
    const baseUrl = obtenerUrlServer();

    // C-2: No incluir token en la URL — se envía como primer mensaje
    socket = new WebSocket(baseUrl);

    let authConfirmado = false;

    socket.addEventListener('open', () => {
        // Enviar token como primer mensaje (C-2)
        socket.send(JSON.stringify({ tipo: 'auth', token }));
    });

    socket.addEventListener('close', (event) => {
        if (cierreIntencional) {
            cierreIntencional = false;
            return;
        }

        if (handlers.onClose) handlers.onClose(event);

        // Algoritmo de reconexión con Backoff Exponencial
        if (event.code !== 4001 && event.code !== 4002 && event.code !== 4003) {
            if (reintentosConexion < MAX_REINTENTOS) {
                reintentosConexion++;
                const delay = 1000 * Math.pow(2, reintentosConexion);
                console.log(`[WS] Reconectando en ${delay}ms (intento ${reintentosConexion}/${MAX_REINTENTOS})...`);
                reconexionTimeout = setTimeout(() => conectar(token, handlers), delay);
            } else {
                if (handlers.onReconnectionFailed) handlers.onReconnectionFailed();
            }
        }
    });

    socket.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);

            // C-2: Disparar onOpen solo cuando el servidor confirma autenticación
            if (!authConfirmado && data.tipo === 'auth-info') {
                authConfirmado = true;
                reintentosConexion = 0;
                if (handlers.onOpen) handlers.onOpen();
            }

            if (handlers.onMessage) handlers.onMessage(data);
        } catch (err) {
            console.error('[WS] Error al parsear mensaje de entrada:', err);
        }
    });

    socket.addEventListener('error', (err) => {
        if (handlers.onError) handlers.onError(err);
    });
}

/**
 * Envía un objeto serializado en JSON al servidor.
 * @param {object} obj - Objeto a enviar
 * @returns {boolean} True si se envió, False de lo contrario
 */
export function enviarMensaje(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

/**
 * Cierra la conexión activa de forma intencional.
 */
export function cerrarConexion() {
    cierreIntencional = true;
    if (reconexionTimeout) {
        clearTimeout(reconexionTimeout);
        reconexionTimeout = null;
    }
    if (socket) {
        socket.close();
        socket = null;
    }
    reintentosConexion = 0;
}

/**
 * Obtiene el estado actual de la conexión.
 */
export function obtenerEstadoSocket() {
    return socket ? socket.readyState : WebSocket.CLOSED;
}
