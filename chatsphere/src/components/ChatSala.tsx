import React, { useState, useRef, useEffect } from 'react';
import { Message, RoomUser } from '../types';
import { useChatStore } from '../stores/useChatStore';

interface ChatSalaProps {
  onBack: () => void;
  messages: Message[];
  onSendMessage: (text: string) => void;
}

export default function ChatSala({
  onBack,
  messages,
  onSendMessage,
}: ChatSalaProps) {
  const [typedMessage, setTypedMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Estados y acciones globales de Zustand
  const currentRoomCode = useChatStore((state) => state.currentRoomCode);
  const rooms = useChatStore((state) => state.rooms);
  const roomUsers = useChatStore((state) => state.roomUsers);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const currentUser = useChatStore((state) => state.currentUser);
  
  // Mute
  const isMuted = useChatStore((state) => state.isMuted);
  const muteDurationRemaining = useChatStore((state) => state.muteDurationRemaining);

  // Acciones
  const sendPublicTyping = useChatStore((state) => state.sendPublicTyping);
  const startP2PChat = useChatStore((state) => state.startP2PChat);
  const navigateTo = useChatStore((state) => state.navigateTo);
  
  // Moderación
  const kickUser = useChatStore((state) => state.kickUser);
  const muteUser = useChatStore((state) => state.muteUser);
  const changeUserRole = useChatStore((state) => state.changeUserRole);

  // UI local para el drawer de usuarios y modal de moderación
  const [showUsersDrawer, setShowUsersDrawer] = useState(false);
  const [escribiendoLocal, setEscribiendoLocal] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Modal para ingresar motivos o duraciones
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    tipo: 'kick' | 'mute' | 'role';
    user: RoomUser;
    titulo: string;
    placeholder: string;
    valorDefecto: string;
  } | null>(null);
  const [modalInputValue, setModalInputValue] = useState('');
  const [selectedRole, setSelectedRole] = useState<'user' | 'moderator' | 'admin'>('user');

  // Encontrar datos de la sala actual
  const currentRoom = rooms.find(r => r.code === currentRoomCode) || {
    name: currentRoomCode.charAt(0).toUpperCase() + currentRoomCode.slice(1).replace('-', ' '),
    onlineCount: roomUsers.length
  };

  // Auto-scroll al fondo
  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || isMuted) return;
    onSendMessage(typedMessage.trim());
    setTypedMessage('');
    
    if (escribiendoLocal) {
      setEscribiendoLocal(false);
      sendPublicTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedMessage(e.target.value);
    if (isMuted) return;

    if (!escribiendoLocal) {
      setEscribiendoLocal(true);
      sendPublicTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setEscribiendoLocal(false);
      sendPublicTyping(false);
    }, 3000);
  };

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleUserClick = (user: RoomUser) => {
    if (user.userId === currentUser?.id) return;
    
    // Iniciar conversación P2P y navegar
    startP2PChat(user.userId, user.displayName);
    setShowUsersDrawer(false);
    navigateTo('chat-privado', 'push');
  };

  // Abrir modal de moderación
  const openModModal = (tipo: 'kick' | 'mute' | 'role', user: RoomUser) => {
    if (tipo === 'kick') {
      setModalConfig({
        tipo,
        user,
        titulo: `Expulsar a ${user.displayName}`,
        placeholder: 'Motivo de la expulsión',
        valorDefecto: 'Infracción de las reglas'
      });
      setModalInputValue('Infracción de las reglas');
    } else if (tipo === 'mute') {
      setModalConfig({
        tipo,
        user,
        titulo: `Silenciar a ${user.displayName}`,
        placeholder: 'Duración en segundos (máx 3600)',
        valorDefecto: '60'
      });
      setModalInputValue('60');
    } else if (tipo === 'role') {
      setModalConfig({
        tipo,
        user,
        titulo: `Asignar rol a ${user.displayName}`,
        placeholder: '',
        valorDefecto: user.role
      });
      setSelectedRole(user.role);
    }
    setModalOpen(true);
  };

  const handleModalConfirm = () => {
    if (!modalConfig) return;
    
    const user = modalConfig.user;
    if (modalConfig.tipo === 'kick') {
      kickUser(user.userId, modalInputValue.trim() || 'Infracción de las reglas');
    } else if (modalConfig.tipo === 'mute') {
      const segs = parseInt(modalInputValue, 10);
      if (!isNaN(segs) && segs > 0 && segs <= 3600) {
        muteUser(user.userId, segs);
      } else {
        alert('Ingresa un número entre 1 y 3600');
        return;
      }
    } else if (modalConfig.tipo === 'role') {
      changeUserRole(user.userId, selectedRole);
    }

    setModalOpen(false);
    setModalConfig(null);
  };

  // Roles y permisos
  const miRol = currentUser?.role || 'user';
  const soyModeradorOAdmin = miRol === 'moderator' || miRol === 'admin';

  // Formatear indicador de escritura
  const getTypingIndicatorText = () => {
    // Filtrar a nosotros mismos de la lista de personas escribiendo
    const otrosEscribiendo = typingUsers.filter(u => u !== currentUser?.displayName);
    if (otrosEscribiendo.length === 0) return '';
    if (otrosEscribiendo.length === 1) return `${otrosEscribiendo[0]} está escribiendo...`;
    if (otrosEscribiendo.length === 2) return `${otrosEscribiendo[0]} y ${otrosEscribiendo[1]} están escribiendo...`;
    return 'Varios usuarios están escribiendo...';
  };

  const typingText = getTypingIndicatorText();

  // Generar color de avatar
  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-pink-500', 'bg-cyan-500'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] flex flex-col h-screen overflow-hidden">
      {/* Top Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 glass-header flex justify-between items-center px-4 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="active:scale-95 transition-transform duration-200 text-gray-400 hover:bg-white/10 p-2 rounded-full flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>

          <div className="flex flex-col">
            <h2 className="text-base font-bold text-white tracking-tight leading-none font-sans">
              {currentRoom.name}
            </h2>
            <span className="text-[10px] text-gray-500 mt-1 block font-sans">
              {roomUsers.length} miembros en línea
            </span>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowUsersDrawer(true)}
            className="text-indigo-400 hover:bg-white/10 p-2 rounded-full transition-colors active:scale-95 flex items-center justify-center"
            title="Ver usuarios en la sala"
          >
            <span className="material-symbols-outlined text-xl">group</span>
          </button>
        </div>
      </header>

      {/* Group Chat Thread */}
      <main className="flex-1 overflow-y-auto px-4 pt-18 pb-28 custom-scrollbar">
        {/* Date chip */}
        <div className="text-center my-6 select-none">
          <span className="text-[11px] font-bold bg-[#111113] text-gray-500 px-4 py-1.5 rounded-full uppercase tracking-wider border border-white/10 shadow-sm font-sans">
            Hoy
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {messages.map((msg, index) => {
            const isSystem = msg.senderId === 'system';
            
            if (isSystem) {
              return (
                <div key={msg.id || index} className="text-center my-2 select-none">
                  <span className="text-[11px] font-semibold text-amber-500/80 bg-amber-500/5 border border-amber-500/10 px-3 py-1 rounded-full font-sans">
                    ⚠️ {msg.text}
                  </span>
                </div>
              );
            }

            if (msg.isSentByMe) {
              return (
                <div key={msg.id || index} className="flex items-end justify-end gap-2 max-w-[85%] ml-auto mt-1">
                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-indigo-600 shadow-md shadow-indigo-600/10 px-4 py-2.5 rounded-2xl rounded-tr-xs text-white select-text">
                      <p className="text-sm font-sans whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                    <div className="flex items-center gap-1 select-none">
                      <span className="text-[9px] text-gray-500">{msg.timestamp}</span>
                    </div>
                  </div>
                </div>
              );
            } else {
              const avatarBg = getAvatarColor(msg.senderName);
              return (
                <div key={msg.id || index} className="flex items-end gap-2.5 max-w-[85%] mt-1">
                  {/* Avatar */}
                  <div className="relative shrink-0 select-none pb-5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs ${avatarBg}`}>
                      {msg.senderName.substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 overflow-hidden">
                    {/* Username */}
                    <span className="text-[11px] font-bold text-indigo-400 tracking-wide ml-0.5 font-sans select-none">
                      {msg.senderName}
                    </span>

                    {/* Chat Bubble */}
                    <div className="glass px-4 py-2.5 rounded-2xl rounded-tl-xs text-gray-100 select-text">
                      <p className="text-sm font-sans leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>

                    <span className="text-[9px] text-gray-500 ml-1.5 mt-0.5 select-none">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }
          })}

          {/* Typing Indicator */}
          {typingText && (
            <div className="flex items-center gap-2 mt-2 self-start transition-opacity duration-300 select-none">
              <div className="glass px-4 py-2.5 rounded-full flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 font-sans">{typingText}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* bottom chat bar */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 px-4 pt-3 pb-8 z-30">
        <form onSubmit={handleSend} className="flex items-center gap-2.5">
          <button
            type="button"
            className="text-gray-400 hover:bg-white/10 p-2.5 rounded-full transition-colors active:scale-95 flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
          </button>

          <div className="flex-1 glass rounded-full flex items-center px-4 py-1.5 h-11 border border-white/5 focus-within:border-indigo-500/30 transition-all">
            <input
              id="chat-input"
              type="text"
              value={typedMessage}
              onChange={handleInputChange}
              disabled={isMuted}
              placeholder={isMuted ? `Silenciado temporalmente por ${muteDurationRemaining}s...` : 'Escribe tu mensaje...'}
              className="bg-transparent border-none outline-none focus:ring-0 w-full text-sm text-gray-100 placeholder:text-gray-500 font-sans"
            />
          </div>

          <button
            id="send-button"
            type="submit"
            disabled={!typedMessage.trim() || isMuted}
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 transform shrink-0 ${
              typedMessage.trim() && !isMuted
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 active:scale-95'
                : 'bg-[#111113] text-gray-600 border border-white/5 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-xl font-variation-settings-'FILL'-1 material-symbols-fill">send</span>
          </button>
        </form>
      </div>

      {/* Slide-out Drawer for Room Users */}
      {showUsersDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end select-none">
          {/* Backdrop */}
          <div
            onClick={() => setShowUsersDrawer(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          ></div>
          
          {/* Panel */}
          <div className="relative w-80 max-w-full bg-[#0d0d0f] border-l border-white/10 h-full flex flex-col p-6 shadow-2xl z-10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-bold text-white font-sans">Usuarios en Sala</h3>
              <button
                onClick={() => setShowUsersDrawer(false)}
                className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            
            <p className="text-[10px] text-gray-500 mb-4 leading-normal font-sans">
              Haz clic en un miembro para iniciar un chat privado WebRTC.
            </p>

            <div className="flex-1 overflow-y-auto space-y-3.5 custom-scrollbar pr-1">
              {roomUsers.map((user) => {
                const isMe = user.userId === currentUser?.id;
                const userColor = getAvatarColor(user.displayName);
                const showModOptions = soyModeradorOAdmin && user.role !== 'admin' && !(miRol === 'moderator' && user.role === 'moderator') && !isMe;

                return (
                  <div
                    key={user.userId}
                    onClick={() => !isMe && handleUserClick(user)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-[#111113]/40 ${
                      isMe ? 'cursor-default border-indigo-500/20' : 'cursor-pointer hover:bg-white/5 transition-colors'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${userColor}`}>
                        {user.displayName.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate font-sans">
                          {user.displayName} {isMe && '(Tú)'}
                        </p>
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 uppercase tracking-wide ${
                          user.role === 'admin' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          user.role === 'moderator' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>

                    {/* Controles de moderación */}
                    {showModOptions && (
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openModModal('mute', user)}
                          className="p-1 hover:bg-white/10 rounded text-yellow-500 active:scale-90 transition-transform"
                          title="Silenciar usuario"
                        >
                          <span className="material-symbols-outlined text-base">volume_off</span>
                        </button>
                        <button
                          onClick={() => openModModal('kick', user)}
                          className="p-1 hover:bg-white/10 rounded text-red-500 active:scale-90 transition-transform"
                          title="Expulsar usuario"
                        >
                          <span className="material-symbols-outlined text-base">gavel</span>
                        </button>
                        {miRol === 'admin' && (
                          <button
                            onClick={() => openModModal('role', user)}
                            className="p-1 hover:bg-white/10 rounded text-blue-400 active:scale-90 transition-transform"
                            title="Cambiar rol"
                          >
                            <span className="material-symbols-outlined text-base">manage_accounts</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Reactive Modals for Moderation */}
      {modalOpen && modalConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setModalOpen(false)}></div>
          <div className="bg-[#111113] border border-white/10 rounded-2xl p-6 max-w-sm w-full relative z-10 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4 font-sans">{modalConfig.titulo}</h3>
            
            {modalConfig.tipo === 'role' ? (
              <div className="space-y-3 mb-6">
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Selecciona el nuevo rol:</label>
                <div className="flex gap-2">
                  {(['user', 'moderator', 'admin'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRole(r)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all border ${
                        selectedRole === r
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10'
                          : 'bg-transparent text-gray-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <input
                  type={modalConfig.tipo === 'mute' ? 'number' : 'text'}
                  value={modalInputValue}
                  onChange={(e) => setModalInputValue(e.target.value)}
                  placeholder={modalConfig.placeholder}
                  className="w-full bg-[#0a0a0b] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:border-indigo-500/50 outline-none font-sans"
                />
              </div>
            )}

            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-gray-400 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleModalConfirm}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all shadow-md"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
