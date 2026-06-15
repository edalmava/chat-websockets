/**
 * GESTOR DE LA CONEXIÓN WEBSOCKET (TypeScript)
 */

import { CONFIG } from '../config';

let socket: WebSocket | null = null;
let reintentosConexion = 0;
const MAX_REINTENTOS = 5;
let reconexionTimeout: NodeJS.Timeout | null = null;
let cierreIntencional = false;
let tokenActual: string | null = null;

export interface WebSocketHandlers {
    onOpen?: () => void;
    onClose?: (event: CloseEvent) => void;
    onMessage?: (data: any) => void;
    onError?: (err: Event) => void;
    onReconnectionFailed?: () => void;
}

function obtenerUrlServer(): string {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev ? `ws://localhost:${CONFIG.WS_PORT || 8443}` : 'wss://chat.colsaba.site';
}

/**
 * Establece el token de sesión.
 */
export function setToken(token: string) {
    tokenActual = token;
}

/**
 * Conecta al servidor WebSocket.
 */
export function conectar(token: string, handlers: WebSocketHandlers = {}) {
    tokenActual = token;
    if (socket) {
        cierreIntencional = true;
        socket.close();
    }
    
    cierreIntencional = false;
    const baseUrl = obtenerUrlServer();

    // No incluir token en la URL — se envía como primer mensaje
    socket = new WebSocket(baseUrl);

    let authConfirmado = false;

    socket.addEventListener('open', () => {
        // Enviar token como primer mensaje
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ tipo: 'auth', token }));
        }
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
                reconexionTimeout = setTimeout(() => conectar(tokenActual || '', handlers), delay);
            } else {
                if (handlers.onReconnectionFailed) handlers.onReconnectionFailed();
            }
        }
    });

    socket.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);

            // Disparar onOpen solo cuando el servidor confirma autenticación
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
 */
export function enviarMensaje(obj: any): boolean {
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
export function obtenerEstadoSocket(): number {
    return socket ? socket.readyState : WebSocket.CLOSED;
}
