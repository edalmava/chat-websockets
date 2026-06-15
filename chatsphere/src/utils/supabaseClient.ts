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
