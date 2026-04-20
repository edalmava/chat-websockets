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
 * Sanitiza recursivamente un objeto, arreglo o cadena
 * Limpia cualquier propiedad de tipo string para prevenir XSS
 */
function sanitizeObject(data) {
    if (typeof data === 'string') {
        return sanitizeHtml(data);
    }
    
    if (Array.isArray(data)) {
        return data.map(item => sanitizeObject(item));
    }
    
    if (typeof data === 'object' && data !== null) {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    }
    
    return data;
}

module.exports = {
    isOriginAllowed,
    sanitizeHtml,
    sanitizeObject
};
