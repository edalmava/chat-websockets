/**
 * CONFIGURACIÓN GLOBAL DEL CLIENTE (Vite + TypeScript)
 */
export const CONFIG = Object.freeze({
  SUPABASE_URL: (import.meta.env.VITE_SUPABASE_URL || 'https://mhlkaqlfoeebwztlldgu.supabase.co') as string,
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bOb_T2mYvKDJCGu2uGmVeA_KXTSG6s1') as string,
  WS_PORT: parseInt(import.meta.env.VITE_WS_PORT || '8443', 10),
});
