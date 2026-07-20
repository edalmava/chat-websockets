import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useChatStore } from '../stores/useChatStore';
import { supabaseClient } from '../utils/supabaseClient';

export default function ConfirmEmail() {
  const navigateTo = useChatStore((state) => state.navigateTo);
  const addNotification = useChatStore((state) => state.addNotification);

  const [checkingUrl, setCheckingUrl] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function verifyConfirmLink() {
      try {
        // Intento 1: El SDK de Supabase ya procesó #access_token automáticamente
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
          setCheckingUrl(false);
          setSuccess(true);
          addNotification('success', 'Email confirmado correctamente. Iniciando sesión...');
          setTimeout(() => navigateTo('lista-salas', 'push'), 2000);
          return;
        }

        // Intento 2: Flujo PKCE — código en query params
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const type = searchParams.get('type');
        if (code && (type === 'signup' || !type)) {
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setCheckingUrl(false);
          setSuccess(true);
          addNotification('success', 'Email confirmado correctamente. Iniciando sesión...');
          setTimeout(() => navigateTo('lista-salas', 'push'), 2000);
          return;
        }

        // Intento 3: Flujo legacy — token + email en query params
        const token = searchParams.get('token');
        const email = searchParams.get('email');
        if (token && email && (type === 'signup' || !type)) {
          const { error } = await supabaseClient.auth.verifyOtp({ token, type: 'signup', email });
          if (error) throw error;
          setCheckingUrl(false);
          setSuccess(true);
          addNotification('success', 'Email confirmado correctamente. Iniciando sesión...');
          setTimeout(() => navigateTo('lista-salas', 'push'), 2000);
          return;
        }

        throw new Error('No se encontró un enlace de confirmación válido.');
      } catch (err: any) {
        setCheckingUrl(false);
        if (err.message?.includes('expired') || err.message?.includes('Email link is invalid or has expired')) {
          setError('El enlace de confirmación ha expirado o es inválido.');
        } else if (err.message?.includes('already confirmed') || err.message?.includes('already verified')) {
          setError('El email ya fue confirmado anteriormente.');
          setTimeout(() => navigateTo('auth', 'push'), 2000);
        } else {
          setError(err.message || 'Error al procesar el enlace de confirmación.');
        }
      }
    }

    verifyConfirmLink();
  }, [navigateTo, addNotification]);

  const handleResend = async () => {
    setError('');
    const { data: { session } } = await supabaseClient.auth.getSession();
    let email = session?.user?.email || null;
    
    if (!email) {
      const searchParams = new URLSearchParams(window.location.search);
      email = searchParams.get('email');
    }
    
    if (!email) {
      addNotification('info', 'Ve a la pantalla de inicio y usa "¿No recibiste el email de confirmación?"');
      navigateTo('auth', 'push');
      return;
    }
    try {
      const { error } = await supabaseClient.auth.resend({
        type: 'signup',
        email
      });
      if (error) {
        setError(error.message);
      } else {
        addNotification('info', 'Email de confirmación reenviado. Revisa tu bandeja de entrada.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al reenviar email.');
    }
  };

  if (checkingUrl) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4 overflow-hidden select-none">
        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 text-center">
          <svg className="animate-spin mx-auto h-10 w-10 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm text-gray-400 mt-4 font-semibold">Verificando enlace...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4 overflow-hidden select-none">
        <div className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4">
            <span className="material-symbols-outlined text-4xl">check_circle</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white font-sans mb-2">¡Email confirmado!</h1>
          <p className="text-sm text-gray-400">Redirigiendo al chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4 overflow-hidden select-none">
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-full max-w-md bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10"
      >
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mb-4">
            <span className="material-symbols-outlined text-4xl">mark_email_read</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
            Confirmar Email
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Verifica tu dirección de correo para activar tu cuenta
          </p>
        </div>

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm shrink-0">warning</span>
            <span>{error}</span>
          </motion.div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleResend}
            disabled={checkingUrl}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">refresh</span>
            <span>Reenviar email de confirmación</span>
          </button>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigateTo('auth', 'push')}
            className="text-xs text-gray-500 hover:text-indigo-400 transition-colors"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </motion.div>
    </div>
  );
}