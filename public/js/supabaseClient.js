/**
 * ENVOLTORIO (WRAPPER) PARA EL SDK DE SUPABASE AUTH
 */

// Inicializar el cliente Supabase usando las constantes globales de config.js
const supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
);

/**
 * Registra un nuevo usuario en Supabase Auth y crea su perfil en la BD
 * @param {string} email - Correo del usuario
 * @param {string} password - Contraseña (mínimo 6 caracteres)
 * @param {string} displayName - Nombre público a mostrar en el chat
 * @returns {Promise<object>} Objeto con { data, error } retornado por el SDK
 */
async function registrarUsuario(email, password, displayName) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName.trim()
                }
            }
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Inicia sesión de un usuario con email y contraseña
 * @param {string} email - Correo electrónico
 * @param {string} password - Contraseña
 * @returns {Promise<object>} Objeto con { data, error }
 */
async function iniciarSesion(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Cierra la sesión activa en el cliente
 * @returns {Promise<object>} Objeto con { error }
 */
async function cerrarSesion() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        return { error };
    } catch (err) {
        return { error: err };
    }
}

/**
 * Obtiene la sesión actual persistida (si existe)
 * @returns {Promise<object|null>} Sesión de Supabase o null
 */
async function obtenerSesion() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        return data.session;
    } catch (err) {
        console.error('Error al obtener la sesión de Supabase:', err);
        return null;
    }
}

/**
 * Obtiene el access_token JWT vigente
 * @returns {Promise<string|null>} Token JWT o null
 */
async function obtenerToken() {
    const session = await obtenerSesion();
    return session?.access_token || null;
}

/**
 * Registra un callback que escucha cambios de autenticación
 * Eventos comunes: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
 * @param {function} callback - Callback (event, session)
 */
function onCambioEstadoAuth(callback) {
    supabaseClient.auth.onAuthStateChange(callback);
}
