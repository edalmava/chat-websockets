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

const CLIENT_ID_KEY = 'ws_clientId';
const COUNTER_KEY = 'ws_clientCounter';
const OFFLINE_QUEUE_KEY = 'ws_offlineQueue';

function obtenerClientId(): string {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
}

function obtenerContador(): number {
    return parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
}

function incrementarContador(): number {
    const nuevo = obtenerContador() + 1;
    localStorage.setItem(COUNTER_KEY, String(nuevo));
    return nuevo;
}

function generarClientOffset(userId: string): string {
    const counter = incrementarContador();
    return `${userId}-${Date.now()}-${counter}`;
}

function getOfflineQueue(): any[] {
    try {
        return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    } catch { return []; }
}

function setOfflineQueue(queue: any[]) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function addToOfflineQueue(msg: any) {
    const queue = getOfflineQueue();
    queue.push({ ...msg, _offlineQueue: true });
    setOfflineQueue(queue);
}

function flushOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    setOfflineQueue([]);
    queue.forEach(msg => {
        if (msg.tipo !== 'chat') return;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg));
        }
    });
}

interface PendingAck {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timer: NodeJS.Timeout;
}

const acksPendientes = new Map<string, PendingAck>();

function limpiarTodosLosAcks(motivo: string) {
    for (const [id, pending] of acksPendientes) {
        clearTimeout(pending.timer);
        pending.reject(new Error(motivo));
    }
    acksPendientes.clear();
}

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

        limpiarTodosLosAcks('Conexión cerrada inesperadamente');

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

            // Interceptar acknowledgements (responseTo)
            if (data.responseTo && acksPendientes.has(data.responseTo)) {
                const pending = acksPendientes.get(data.responseTo)!;
                clearTimeout(pending.timer);
                acksPendientes.delete(data.responseTo);
                if (data.status === 'error') {
                    pending.reject(new Error(data.mensaje || 'Error del servidor'));
                } else {
                    pending.resolve(data.payload || data);
                }
                return;
            }

            // Disparar onOpen solo cuando el servidor confirma autenticación
            if (!authConfirmado && data.tipo === 'auth-info') {
                authConfirmado = true;
                reintentosConexion = 0;
                // Reenviar mensajes encolados durante la desconexión
                flushOfflineQueue();
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
 * Si el socket no está conectado, encola en localStorage para reenvío posterior.
 */
export function enviarMensaje(obj: any): boolean {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(obj));
        return true;
    }
    addToOfflineQueue(obj);
    return false;
}

/**
 * Envía un mensaje y espera una confirmación (ack) del servidor.
 * Si no se recibe respuesta en `timeoutMs`, la Promise se rechaza.
 */
export function enviarConAck(obj: any, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        obj.requestId = requestId;

        const timer = setTimeout(() => {
            acksPendientes.delete(requestId);
            reject(new Error(`Timeout: no se recibió confirmación para ${requestId}`));
        }, timeoutMs);

        acksPendientes.set(requestId, { resolve, reject, timer });

        if (!enviarMensaje(obj)) {
            clearTimeout(timer);
            acksPendientes.delete(requestId);
            reject(new Error('Socket no disponible'));
        }
    });
}

/**
 * Cierra la conexión activa de forma intencional.
 */
export function cerrarConexion() {
    cierreIntencional = true;
    limpiarTodosLosAcks('Conexión cerrada');
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

/**
 * Genera un identificador único de mensaje para deduplicación (userId-timestamp-counter).
 */
export { generarClientOffset };

/**
 * Fuerza el reenvío inmediato de la cola offline almacenada en localStorage.
 */
export function forzarFlushOffline() {
    flushOfflineQueue();
}
