/**
 * UTILIDADES DE VALIDACIÓN DE ENTRADA Y RATE LIMITING
 */

const { VALIDACION } = require('../config/constants');

/**
 * Valida que el usuario tenga formato correcto
 */
function validarUsuario(usuario) {
    if (!usuario || typeof usuario !== 'string') {
        return { válido: false, error: 'El nombre de usuario es requerido' };
    }

    usuario = usuario.trim();

    if (usuario.length < VALIDACION.USERNAME_MIN || usuario.length > VALIDACION.USERNAME_MAX) {
        return { 
            válido: false, 
            error: `El nombre debe tener entre ${VALIDACION.USERNAME_MIN} y ${VALIDACION.USERNAME_MAX} caracteres` 
        };
    }

    if (!/^[\p{L}\p{N}\s\-_.@]+$/u.test(usuario)) {
        return { válido: false, error: 'El nombre contiene caracteres inválidos' };
    }

    return { válido: true, usuario: usuario };
}

/**
 * Valida que el mensaje tenga formato correcto
 */
function validarMensaje(mensaje) {
    if (!mensaje || typeof mensaje !== 'string') {
        return { válido: false, error: 'El mensaje es requerido' };
    }

    mensaje = mensaje.trim();

    if (mensaje.length < VALIDACION.MESSAGE_MIN || mensaje.length > VALIDACION.MESSAGE_MAX) {
        return { 
            válido: false, 
            error: `El mensaje debe tener entre ${VALIDACION.MESSAGE_MIN} y ${VALIDACION.MESSAGE_MAX} caracteres` 
        };
    }

    return { válido: true, mensaje: mensaje };
}

/**
 * Verifica si el cliente ha excedido el límite de frecuencia (rate limiting)
 */
function verificarRateLimit(client) {
    const ahora = Date.now();
    
    // Inicializar historial si no existe
    if (!client.messageTimestamps) {
        client.messageTimestamps = [];
    }

    // Remover mensajes fuera de la ventana de tiempo
    client.messageTimestamps = client.messageTimestamps.filter(
        timestamp => ahora - timestamp < VALIDACION.RATE_LIMIT_WINDOW
    );

    // Verificar si se excedió el límite
    if (client.messageTimestamps.length >= VALIDACION.RATE_LIMIT_MESSAGES) {
        return { permitido: false, error: `Demasiados mensajes. Máximo ${VALIDACION.RATE_LIMIT_MESSAGES} por segundo` };
    }

    // Registrar este mensaje
    client.messageTimestamps.push(ahora);
    return { permitido: true };
}

module.exports = {
    validarUsuario,
    validarMensaje,
    verificarRateLimit
};
