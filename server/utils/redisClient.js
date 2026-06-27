const Redis = require('ioredis');
const { REDIS_URL, STREAM_MAXLEN, CATCHUP_LIMIT } = require('../config/constants');

let client = null;

function conectarRedis(logger) {
    if (client) return client;

    client = new Redis(REDIS_URL, {
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: false,
        maxRetriesPerRequest: null
    });

    client.on('error', (err) => {
        if (logger) logger.log('ERROR', 'redis_error', 'system', { error: err.message });
    });

    client.on('connect', () => {
        if (logger) logger.log('INFO', 'redis_connected', 'system', { url: REDIS_URL.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@') });
    });

    client.on('close', () => {
        if (logger) logger.log('WARNING', 'redis_closed', 'system', {});
    });

    return client;
}

function normalizarKey(sala) {
    return sala.toLowerCase().replace(/\s+/g, '-');
}

async function guardarMensaje(roomName, clientOffset, usuario, userId, mensaje, timestamp) {
    const key = `room:messages:${normalizarKey(roomName)}`;
    const id = await client.xadd(key, 'MAXLEN', '~', STREAM_MAXLEN, '*',
        'clientOffset', clientOffset || '',
        'usuario', usuario,
        'userId', userId,
        'mensaje', mensaje,
        'timestamp', timestamp
    );
    return id;
}

async function obtenerMensajes(roomName, desde = '-', hasta = '+', count = CATCHUP_LIMIT) {
    const key = `room:messages:${normalizarKey(roomName)}`;
    const entries = await client.xrange(key, desde, hasta, 'COUNT', count);
    return entries.map(([id, fields]) => {
        const obj = {};
        for (let i = 0; i < fields.length; i += 2) {
            obj[fields[i]] = fields[i + 1];
        }
        return { id, ...obj };
    });
}

async function obtenerUltimosMensajes(roomName, count) {
    const key = `room:messages:${normalizarKey(roomName)}`;
    const entries = await client.xrevrange(key, '+', '-', 'COUNT', count);
    entries.reverse();
    return entries.map(([id, fields]) => {
        const obj = {};
        for (let i = 0; i < fields.length; i += 2) {
            obj[fields[i]] = fields[i + 1];
        }
        return { id, ...obj };
    });
}

async function marcarDedup(clientOffset, ttl = 604800) {
    if (!clientOffset) return;
    await client.set(`dedup:${clientOffset}`, '1', 'EX', ttl);
}

async function existeDedup(clientOffset) {
    if (!clientOffset) return false;
    const result = await client.exists(`dedup:${clientOffset}`);
    return result === 1;
}

async function trimPorEdad(maxAgeMs) {
    const maxAgeTimestamp = Date.now() - maxAgeMs;
    const minId = `${maxAgeTimestamp}-0`;
    let cursor = '0';
    let total = 0;
    do {
        try {
            const result = await client.scan(cursor, 'MATCH', 'room:messages:*', 'COUNT', 50);
            cursor = result[0];
            const keys = result[1];
            for (const key of keys) {
                try {
                    total += await client.xtrim(key, 'MINID', '~', minId);
                } catch (_) { /* ignorar errores por key */ }
            }
        } catch (_) { break; }
    } while (cursor !== '0');
    return total;
}

function obtenerCliente() {
    return client;
}

module.exports = {
    conectarRedis,
    normalizarKey,
    guardarMensaje,
    obtenerMensajes,
    obtenerUltimosMensajes,
    marcarDedup,
    existeDedup,
    trimPorEdad,
    obtenerCliente
};
