import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useChatStore } from '../stores/useChatStore';
import * as supabaseClient from '../utils/supabaseClient';

export default function ResetPassword() {
  const navigateTo = useChatStore((state) => state.navigateTo);
  const addNotification = useChatStore((state) => state.addNotification);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [checkingUrl, setCheckingUrl] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const code = params.get('code');
    const token = params.get('token');
    const email = params.get('email');

    async function verifyRecoveryLink() {
      try {
        if (type === 'recovery') {
          if (code) {
            const { error } = await supabaseClient.supabaseClient.auth.exchangeCodeForSession(code);
            if (error) throw error;
          } else if (token && email) {
            const { error } = await supabaseClient.supabaseClient.auth.verifyOtp({ token, type: 'recovery', email });
            if (error) throw error;
          } else if (token) {
            // Fallback: try verifyOtp with email if available
            const { error } = await supabaseClient.supabaseClient.auth.verifyOtp({ token, type: 'recovery', email: email || '' });
            if (error) throw error;
          } else {
            const { data: { session } } = await supabaseClient.supabaseClient.auth.getSession();
            if (!session) throw new Error('No session');
          }
          setCheckingUrl(false);
          return;
        }
        throw new Error('Invalid type');
      } catch {
        setCheckingUrl(false);
        setError('El enlace de recuperación ha expirado o es inválido. Solicita uno nuevo.');
      }
    }

    verifyRecoveryLink();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!newPassword || !confirmPassword) {
      setError('Completa ambos campos');
      return;
    }
    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.confirmarRecuperacionContrasena(newPassword);
      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        addNotification('success', 'Contraseña restablecida correctamente');
        // Redirigir a login tras 2s
        setTimeout(() => navigateTo('auth', 'push'), 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
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
          <h1 className="text-2xl font-extrabold tracking-tight text-white font-sans mb-2">¡Listo!</h1>
          <p className="text-sm text-gray-400">Tu contraseña ha sido actualizada. Redirigiendo...</p>
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
            <span className="material-symbols-outlined text-4xl">lock_reset</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
            Nueva Contraseña
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Ingresa tu nueva contraseña para restaurar el acceso
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 ml-1">Nueva contraseña</label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 ml-1">Confirmar contraseña</label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all duration-200 mt-2 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Actualizando...</span>
              </>
            ) : (
              <span>Restablecer contraseña</span>
            )}
          </button>
        </form>

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