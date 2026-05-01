/**
 * CONFIGURACIÓN Y CONSTANTES DEL SERVIDOR
 */

const PORT = process.env.PORT || 8443;

// Orígenes permitidos para CORS (WebSocket)
const ALLOWED_ORIGINS = [
    'http://localhost:5500',    // Live Server (VS Code)
    'http://localhost:3000',    // Servidores locales comunes
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080',
    'https://localhost:5500',   // HTTPS local
    'https://localhost:3000',
    'https://127.0.0.1:5500',
    'https://127.0.0.1:3000',
    // En producción, agregar tu dominio:
    // 'https://www.tudominio.com',
    // 'https://tudominio.com'
];

const VALIDACION = {
    USERNAME_MIN: 1,
    USERNAME_MAX: 50,
    MESSAGE_MIN: 1,
    MESSAGE_MAX: 500,
    RATE_LIMIT_MESSAGES: 5,
    RATE_LIMIT_WINDOW: 1000
};

const SALAS_POR_DEFECTO = ['General', 'Desarrollo', 'Soporte', 'Random', 'Gaming', 'Música', 'Cine', 'Deportes', 'Tecnología', 'Off-Topic'];

function esSalaValida(sala) {
    return typeof sala === 'string' && SALAS_POR_DEFECTO.includes(sala);
}

module.exports = {
    PORT,
    ALLOWED_ORIGINS,
    VALIDACION,
    SALAS_POR_DEFECTO,
    esSalaValida
};
