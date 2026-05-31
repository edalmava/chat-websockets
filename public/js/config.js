/**
 * CONFIGURACIÓN GLOBAL DEL CLIENTE
 * 
 * Reemplaza los valores con las credenciales de tu proyecto Supabase.
 */
const CONFIG = Object.freeze({
    // URL de tu proyecto Supabase (Dashboard -> Settings -> API -> Project URL)
    SUPABASE_URL: window.env?.SUPABASE_URL || 'https://mhlkaqlfoeebwztlldgu.supabase.co',
    
    // Clave anónima pública de Supabase (Dashboard -> Settings -> API -> anon/public)
    SUPABASE_ANON_KEY: window.env?.SUPABASE_ANON_KEY || 'sb_publishable_bOb_T2mYvKDJCGu2uGmVeA_KXTSG6s1',
    
    // Puerto websocket del servidor (por defecto 8443)
    WS_PORT: 8443
});
