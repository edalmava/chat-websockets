import { createClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { CONFIG } from '../config';

// Inicializar el cliente Supabase usando las constantes de config.ts
export const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/**
 * Registra un nuevo usuario en Supabase Auth y crea su perfil en la BD
 * @param {string} email - Correo del usuario
 * @param {string} password - Contraseña (mínimo 6 caracteres)
 * @param {string} displayName - Nombre público a mostrar en el chat
 * @returns {Promise<object>} Objeto con { data, error } retornado por el SDK
 */
export async function registrarUsuario(email: string, password: string, displayName: string) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName.trim()
                },
                emailRedirectTo: `${window.location.origin}/confirm-email`
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
export async function iniciarSesion(email: string, password: string) {
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
export async function cerrarSesion() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        return { error };
    } catch (err) {
        return { error: err };
    }
}

/**
 * Obtiene la sesión actual persistida (si existe)
 * @returns {Promise<Session | null>} Sesión de Supabase o null
 */
export async function obtenerSesion(): Promise<Session | null> {
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
export async function obtenerToken(): Promise<string | null> {
    const session = await obtenerSesion();
    return session?.access_token || null;
}

/**
 * Registra un callback que escucha cambios de autenticación
 * Eventos comunes: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
 * @param {function} callback - Callback (event, session)
 */
export function onCambioEstadoAuth(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    supabaseClient.auth.onAuthStateChange(callback);
}

/**
 * Actualiza el nombre público (display_name) en user_metadata
 */
export async function actualizarPerfil(displayName: string) {
    try {
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { display_name: displayName.trim() }
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Cambia la contraseña del usuario autenticado
 * Requiere sesión activa (access_token válido)
 */
export async function cambiarContrasena(nuevaContrasena: string) {
    try {
        const { data, error } = await supabaseClient.auth.updateUser({
            password: nuevaContrasena
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Envía email de recuperación de contraseña
 * redirectTo: URL donde Supabase redirige tras click en email (debe estar en "Redirect URLs" de Supabase Auth)
 */
export async function recuperarContrasena(email: string) {
    try {
        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Actualiza contraseña tras confirmación por email (token en URL)
 * Se usa en página dedicada /reset-password
 */
export async function confirmarRecuperacionContrasena(nuevaContrasena: string) {
    try {
        const { data, error } = await supabaseClient.auth.updateUser({
            password: nuevaContrasena
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Obtiene usuario actual (para refrescar displayName tras update)
 */
export async function obtenerUsuario() {
    try {
        const { data, error } = await supabaseClient.auth.getUser();
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}

/**
 * Reenvía email de confirmación de registro (signup)
 */
export async function reenviarConfirmacionEmail(email: string) {
    try {
        const { data, error } = await supabaseClient.auth.resend({
            type: 'signup',
            email
        });
        return { data, error };
    } catch (err) {
        return { data: null, error: err };
    }
}
