/**
 * UTILIDADES DE SEGURIDAD (CORS, XSS)
 */

const { ALLOWED_ORIGINS } = require('../config/constants');

/**
 * Valida si el origen está permitido (CORS)
 * @param {string} origin - Header 'Origin' de la solicitud
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    if (!origin) return false;
    return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Escapa caracteres HTML peligrosos para prevenir XSS
 * @param {string} text - Texto a sanitizar
 * @returns {string} Texto escapado
 */
function sanitizeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, char => htmlEscapeMap[char]);
}

/**
 * Sanitiza recursivamente un objeto (usuario y mensaje)
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = { ...obj };
    if (sanitized.usuario) sanitized.usuario = sanitizeHtml(sanitized.usuario);
    if (sanitized.mensaje) sanitized.mensaje = sanitizeHtml(sanitized.mensaje);
    
    return sanitized;
}

module.exports = {
    isOriginAllowed,
    sanitizeHtml,
    sanitizeObject
};
