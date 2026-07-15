import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useChatStore } from '../stores/useChatStore';

export default function PerfilUsuario() {
  const navigateTo = useChatStore((state) => state.navigateTo);
  const currentUser = useChatStore((state) => state.currentUser);
  const session = useChatStore((state) => state.session);
  const updateProfile = useChatStore((state) => state.updateProfile);
  const changePassword = useChatStore((state) => state.changePassword);
  const setEditingProfile = useChatStore((state) => state.setEditingProfile);
  const isEditingProfile = useChatStore((state) => state.isEditingProfile);
  const addNotification = useChatStore((state) => state.addNotification);

  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  // Cargar displayName actual al montar
  useEffect(() => {
    if (currentUser?.displayName) {
      setDisplayName(currentUser.displayName);
    }
    setEditingProfile(false);
  }, [currentUser, setEditingProfile]);

  // Generar color de avatar determinístico
  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-pink-500', 'bg-cyan-500'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const initials = currentUser?.displayName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'US';

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    if (!displayName.trim()) {
      setProfileError('El nombre no puede estar vacío');
      return;
    }
    if (displayName.trim().length > 50) {
      setProfileError('El nombre no puede exceder 50 caracteres');
      return;
    }
    if (displayName.trim() === currentUser?.displayName) {
      setProfileError('El nombre es igual al actual');
      return;
    }

    setProfileLoading(true);
    const res = await updateProfile(displayName.trim());
    setProfileLoading(false);
    if (res.success) {
      addNotification('success', 'Perfil actualizado');
    } else {
      setProfileError(res.error || 'Error al actualizar perfil');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Completa todos los campos');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('La nueva contraseña debe ser diferente a la actual');
      return;
    }

    setPasswordLoading(true);
    const res = await changePassword(currentPassword, newPassword);
    setPasswordLoading(false);
    if (res.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordFields(false);
      addNotification('success', 'Contraseña cambiada');
    } else {
      setPasswordError(res.error || 'Error al cambiar contraseña');
    }
  };

  const handleLogout = async () => {
    const logout = useChatStore.getState().logout;
    await logout();
    navigateTo('auth', 'push_back');
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 glass-header flex justify-between items-center px-4 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('lista-salas', 'push_back')}
            className="active:scale-95 transition-transform duration-200 text-gray-400 hover:bg-white/10 p-2 rounded-full flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <h2 className="font-semibold text-sm text-white leading-none font-sans">Perfil</h2>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 pt-20 pb-24 custom-scrollbar">
        <div className="max-w-md mx-auto space-y-6">
          
          {/* Avatar & Name Preview */}
          <div className="text-center space-y-4">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl mx-auto border border-white/10 shadow-inner ${getAvatarColor(currentUser?.displayName || 'User')}`}>
              {initials}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-sans">{displayName || currentUser?.displayName || 'Usuario'}</h3>
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block mt-1">{currentUser?.role || 'user'}</span>
            </div>
            <p className="text-xs text-gray-500">{session?.user?.email}</p>
          </div>

          {/* Editar Perfil */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring' }}
            className="glass p-6 rounded-2xl border border-white/10"
          >
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400">person</span>
              Editar Perfil
            </h4>
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm shrink-0">warning</span>
                  <span>{profileError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 ml-1">Nombre público</label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">person</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ej. Alex Rivera"
                    maxLength={50}
                    className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={profileLoading || displayName.trim() === currentUser?.displayName}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {profileLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar cambios</span>
                )}
              </button>
            </form>
          </motion.div>

          {/* Cambiar Contraseña */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring', delay: 0.1 }}
            className="glass p-6 rounded-2xl border border-white/10"
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-400">lock</span>
                Cambiar Contraseña
              </h4>
              <button
                type="button"
                onClick={() => setShowPasswordFields(!showPasswordFields)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                {showPasswordFields ? 'Cancelar' : 'Cambiar'}
              </button>
            </div>

            {showPasswordFields && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {passwordError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm shrink-0">warning</span>
                    <span>{passwordError}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 ml-1">Contraseña actual</label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 ml-1">Nueva contraseña</label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••"
                      minLength={6}
                      className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-400 ml-1">Confirmar nueva contraseña</label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-4 text-gray-500 text-lg">lock</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••"
                      minLength={6}
                      className="w-full bg-[#111113] border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-500/50 transition-all outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-600/25 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {passwordLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Cambiando...</span>
                    </>
                  ) : (
                    <span>Actualizar contraseña</span>
                  )}
                </button>
              </form>
            )}
          </motion.div>

          {/* Cerrar Sesión */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring', delay: 0.2 }}
            className="glass p-6 rounded-2xl border border-white/10"
          >
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-400">logout</span>
              Sesión
            </h4>
            <button
              onClick={handleLogout}
              className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-bold py-3 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">logout</span>
              <span>Cerrar sesión</span>
            </button>
          </motion.div>

        </div>
      </main>
    </div>
  );
}