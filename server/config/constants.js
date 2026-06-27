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

const IP_RATE_LIMIT = {
    MAX_CONEXIONES_POR_IP: parseInt(process.env.IP_MAX_CONEXIONES, 10) || 45,
    MAX_INTENTOS_POR_SEGUNDO: parseInt(process.env.IP_MAX_INTENTOS, 10) || 15
};

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

// --- CONFIGURACIÓN DE AUTENTICACIÓN Y ROLES DE SUPABASE ---
// Nota: La verificación de tokens usa únicamente JWKS asimétrica (ES256)
// No se utiliza SUPABASE_JWT_SECRET — se eliminó el soporte HS256 por seguridad

const ROLES = Object.freeze({
    USER: 'user',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
});

const MAX_MUTE_DURATION = 3600; // 1 hora en segundos
const MAX_USERS_PER_ROOM = 50; // #5: Límite de usuarios simultáneos por sala

const MODERATOR_ACTIONS = ['kick_user', 'mute_user'];
const ADMIN_ACTIONS = ['cambiar_rol'];

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STREAM_MAXLEN = parseInt(process.env.STREAM_MAXLEN, 10) || 1000;
const STREAM_MAX_AGE_MS = (parseInt(process.env.STREAM_MAX_AGE_HOURS, 10) || 24) * 60 * 60 * 1000;
const CATCHUP_LIMIT = parseInt(process.env.CATCHUP_LIMIT, 10) || 50;

module.exports = {
    PORT,
    ALLOWED_ORIGINS,
    IP_RATE_LIMIT,
    VALIDACION,
    SALAS_POR_DEFECTO,
    esSalaValida,
    ROLES,
    MAX_MUTE_DURATION,
    MAX_USERS_PER_ROOM,
    MODERATOR_ACTIONS,
    ADMIN_ACTIONS,
    REDIS_URL,
    STREAM_MAXLEN,
    STREAM_MAX_AGE_MS,
    CATCHUP_LIMIT
};
