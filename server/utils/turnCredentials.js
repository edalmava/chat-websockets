const crypto = require('crypto');

function generarCredencialesTURN(identificador = 'user', ttlHoras = 1) {
    const expiracion = Math.floor(Date.now() / 1000) + ttlHoras * 3600;
    const username = `${expiracion}:${identificador}`;
    const credential = crypto
        .createHmac('sha1', process.env.TURN_SECRET)
        .update(username)
        .digest('base64');
    return { username, credential };
}

/**
 * Genera credenciales TURN temporales usando HMAC-SHA1
 * Compatible con el mecanismo use-auth-secret de Coturn (RFC 8656)
 * @param {number} ttlHoras - Tiempo de vida en horas (default: 1)
 */
/* function generarCredencialesTURN(ttlHoras = 1) {
    const ttlSegundos = ttlHoras * 3600;
    const expiracion = Math.floor(Date.now() / 1000) + ttlSegundos;

    // El username codifica la expiración — Coturn lo verifica automáticamente
    const username = `${expiracion}:chat-user`;

    const credential = crypto
        .createHmac('sha1', process.env.TURN_SECRET)
        .update(username)
        .digest('base64');

    return {
        username,
        credential,
        expiracion: new Date(expiracion * 1000).toISOString()
    };
} */

function obtenerConfigICE(user, ttlHoras = 1) {
    const { username, credential } = generarCredencialesTURN(user, ttlHoras);

    return {
        iceServers: [
            {
                urls: process.env.STUN_URL
            },
            {
                urls: [
                    process.env.TURN_URL_UDP,
                    process.env.TURN_URL_TCP
                ],
                username,
                credential
            }
        ],
        iceCandidatePoolSize: 10
    };
}

module.exports = { generarCredencialesTURN, obtenerConfigICE };