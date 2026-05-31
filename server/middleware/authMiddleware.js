const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { ROLES, MODERATOR_ACTIONS, ADMIN_ACTIONS } = require('../config/constants');

// Cliente JWKS singleton para verificación de tokens Supabase (ES256 asimétrica)
const jwks = jwksClient({
    jwksUri: 'https://mhlkaqlfoeebwztlldgu.supabase.co/auth/v1/.well-known/jwks.json'
});

function getKey(header, callback) {
    if (!header || header.alg !== 'ES256') {
        return callback(new Error(`Algoritmo de firma no soportado: ${header?.alg || 'desconocido'}`));
    }
    jwks.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
    });
}

/**
 * Verifica un token JWT de Supabase y retorna los datos estructurados del usuario
 * @param {string} token - Token JWT a verificar
 * @param {Logger} logger - Instancia del logger
 * @returns {object|null} Datos del usuario decodificados o null si falla
 */
async function verificarToken(token, logger) {
    try {
        const decoded = await new Promise((resolve, reject) => {
            jwt.verify(token, getKey, { algorithms: ['ES256'] }, (err, decodedToken) => {
                if (err) return reject(err);
                resolve(decodedToken);
            });
        });

        if (!decoded.sub || decoded.aud !== 'authenticated') {
            throw new Error('Claims requeridos ausentes o incorrectos (sub/aud)');
        }

        // Mapeo correcto de roles de Supabase desde app_metadata, user_metadata o raíz
        const userRole = decoded.app_metadata?.role || decoded.user_metadata?.role || decoded.user_role || ROLES.USER;
        if (!Object.values(ROLES).includes(userRole)) {
            throw new Error(`Rol no reconocido: ${userRole}`);
        }

        return {
            userId: decoded.sub,
            email: decoded.email,
            displayName: decoded.user_metadata?.display_name || decoded.email.split('@')[0],
            role: userRole,
            tokenExp: decoded.exp
        };
    } catch (err) {
        if (logger) {
            logger.log('AUTH', `Token inválido/expirado (${err.message})`, 'WARNING');
        }
        return null;
    }
}

/**
 * Verifica la autenticación usando un token JWT recibido como mensaje
 * (en lugar de query string en la URL de conexión)
 * @param {string} token - Token JWT a verificar
 * @param {Logger} logger - Instancia del logger del servidor
 * @returns {object|null} Retorna los datos del usuario decodificados o null si falla la validación
 */
async function verificarAutenticacionPorMensaje(token, logger) {
    if (!token) {
        if (logger) logger.log('AUTH', 'Token ausente en mensaje de autenticación', 'WARNING');
        return null;
    }
    return await verificarToken(token, logger);
}

/**
 * Verifica si un usuario (representado por su socket) tiene permisos para ejecutar una acción
 * @param {WebSocket} ws - El socket del usuario
 * @param {string} accion - Tipo de mensaje/acción a realizar
 * @returns {boolean} True si tiene permiso, False de lo contrario
 */
function verificarPermiso(ws, accion) {
    const roleHierarchy = {
        [ROLES.USER]: 0,
        [ROLES.MODERATOR]: 1,
        [ROLES.ADMIN]: 2
    };

    const nivelUsuario = roleHierarchy[ws.role] || 0;
    
    let nivelRequerido = 0;
    if (ADMIN_ACTIONS.includes(accion)) {
        nivelRequerido = 2;
    } else if (MODERATOR_ACTIONS.includes(accion)) {
        nivelRequerido = 1;
    }

    return nivelUsuario >= nivelRequerido;
}

module.exports = {
    verificarAutenticacionPorMensaje,
    verificarPermiso,
    verificarToken
};
