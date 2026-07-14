import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useChatStore } from '../stores/useChatStore';

export default function Auth() {
const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Forgot password modal
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const login = useChatStore((state) => state.login);
  const register = useChatStore((state) => state.register);
  const requestPasswordReset = useChatStore((state) => state.requestPasswordReset);
  const navigateTo = useChatStore((state) => state.navigateTo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isLogin) {
        if (!email.trim() || !password) {
          setErrorMsg('Por favor completa todos los campos.');
          setLoading(false);
          return;
        }
        const res = await login(email.trim(), password);
        if (!res.success) {
          setErrorMsg(res.error || 'Error al iniciar sesión.');
        }
      } else {
        if (!displayName.trim() || !email.trim() || !password || !confirmPassword) {
          setErrorMsg('Por favor completa todos los campos.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden.');
          setLoading(false);
          return;
        }
        const res = await register(displayName.trim(), email.trim(), password);
        if (!res.success) {
          setErrorMsg(res.error || 'Error al registrarse.');
        } else {
          // El registro exitoso inicia sesión o pide confirmación
          setErrorMsg('Cuenta creada con éxito. Revisa tu correo o inicia sesión.');
          setIsLogin(true);
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!forgotEmail.trim()) {
      setErrorMsg('Introduce tu correo electrónico.');
      return;
    }
    setForgotLoading(true);
    const res = await requestPasswordReset(forgotEmail.trim());
    setForgotLoading(false);
    if (res.success) {
      setShowForgotPassword(false);
      setForgotEmail('');
    } else {
      setErrorMsg(res.error || 'Error al enviar el correo.');
    }
  };

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
            <span className="material-symbols-outlined text-4xl">forum</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
            ChatSphere
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            {isLogin ? 'Inicia sesión para conectarte en tiempo real' : 'Crea una cuenta para comenzar'}
          </p>
        </div>

        {/* Tab Conmutator */}
        <div className="flex bg-[#111113]/60 border border-white/5 p-1 rounded-2xl mb-6">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setErrorMsg(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              isLogin
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setErrorMsg(''); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
              !isLogin
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Registrarse
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm shrink-0">warning</span>
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 ml-1">Nombre público</label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">person</span>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Alex Rivera"
                  maxLength={50}
                  className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 ml-1">Correo electrónico</label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 ml-1">Contraseña</label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                minLength={6}
                className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
              />
            </div>
            {isLogin && (
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setForgotEmail(email); }}
                className="w-full text-right text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>

          {!isLogin && (
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
                  className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all duration-200 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Autenticando...</span>
              </>
            ) : (
              <span>{isLogin ? 'Ingresar' : 'Crear Cuenta'}</span>
            )}
          </button>
        </form>
      
      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => { setShowForgotPassword(false); setForgotEmail(''); }}></div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#111113] border border-white/10 rounded-2xl p-6 max-w-sm w-full relative z-10 shadow-2xl"
          >
            <h3 id="forgot-title" className="text-sm font-bold text-white mb-4 font-sans">Recuperar contraseña</h3>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed font-sans">
              Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 ml-1">Correo electrónico</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">mail</span>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full bg-[#0a0a0b] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setForgotEmail(''); }}
                  className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-gray-400 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <span>Enviar enlace</span>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
    </div>
  );
}
