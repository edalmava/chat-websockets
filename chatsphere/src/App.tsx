import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useChatStore } from './stores/useChatStore';
import Auth from './components/Auth';
import MensajesPrivados from './components/MensajesPrivados';
import ChatPrivado from './components/ChatPrivado';
import ChatSala from './components/ChatSala';
import ListaSalas from './components/ListaSalas';
import LlamadaOverlay from './components/LlamadaOverlay';
import ImageLightbox from './components/ImageLightbox';

export default function App() {
  const currentScreen = useChatStore((state) => state.currentScreen);
  const transitionDirection = useChatStore((state) => state.transitionDirection);
  const session = useChatStore((state) => state.session);
  const wsStatus = useChatStore((state) => state.wsStatus);
  const rooms = useChatStore((state) => state.rooms);
  
  const p2pThreads = useChatStore((state) => state.p2pThreads);
  const activeP2PUserId = useChatStore((state) => state.activeP2PUserId);
  const p2pMessages = useChatStore((state) => state.p2pMessages);
  
  const roomMessages = useChatStore((state) => state.roomMessages);
  
  // Acciones
  const inicializarChat = useChatStore((state) => state.inicializarChat);
  const navigateTo = useChatStore((state) => state.navigateTo);
  const joinRoom = useChatStore((state) => state.joinRoom);
  const startP2PChat = useChatStore((state) => state.startP2PChat);
  const sendP2PMessage = useChatStore((state) => state.sendP2PMessage);
  const closeP2PChat = useChatStore((state) => state.closeP2PChat);
  const sendRoomMessage = useChatStore((state) => state.sendRoomMessage);
  
  // Notificaciones
  const notifications = useChatStore((state) => state.notifications);
  const removeNotification = useChatStore((state) => state.removeNotification);
  const acceptP2PInvitation = useChatStore((state) => state.acceptP2PInvitation);
  const rejectP2PInvitation = useChatStore((state) => state.rejectP2PInvitation);
  
  // Media call
  const mediaCallState = useChatStore((state) => state.mediaCallState);
  const aceptarLlamadaMedia = useChatStore((state) => state.aceptarLlamadaMedia);
  const rechazarLlamadaMedia = useChatStore((state) => state.rechazarLlamadaMedia);

  // Image lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Inicializar autenticación y sockets — solo una vez al montar
  // Usamos getState() para evitar que la referencia de la función
  // figure como dependencia y cause re-ejecuciones no deseadas.
  useEffect(() => {
    useChatStore.getState().inicializarChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Pantalla de carga inicial si la sesión está cargando y no estamos en auth
  if (!session && currentScreen !== 'auth') {
    return (
      <div className="w-full min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center text-white select-none">
        <span className="material-symbols-outlined text-5xl text-indigo-500 animate-spin">sync</span>
        <p className="text-sm text-gray-400 mt-4 font-semibold">Cargando ChatSphere...</p>
      </div>
    );
  }

  // Variantes de animación para las transiciones fluidas de pantalla
  const screenVariants = {
    initial: (dir: 'push' | 'push_back' | 'none') => {
      if (dir === 'push') return { x: '100%', opacity: 0 };
      if (dir === 'push_back') return { x: '-100%', opacity: 0 };
      return { x: 0, opacity: 0 };
    },
    animate: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        duration: 0.35,
      },
    },
    exit: (dir: 'push' | 'push_back' | 'none') => {
      if (dir === 'push') return { x: '-100%', opacity: 0, transition: { duration: 0.3 } };
      if (dir === 'push_back') return { x: '100%', opacity: 0, transition: { duration: 0.3 } };
      return { opacity: 0, transition: { duration: 0.15 } };
    },
  };

  // Buscar el hilo activo y sus mensajes
  const activeThread = p2pThreads.find(t => t.id === activeP2PUserId);
  const activeP2PMessages = activeP2PUserId ? (p2pMessages[activeP2PUserId] || []) : [];

  // Agregar fallback de navegación — ejecutado después del render para evitar setState durante render
  useEffect(() => {
    if (currentScreen === 'chat-privado' && !activeP2PUserId) {
      navigateTo('mensajes-privados', 'push_back');
    }
  }, [currentScreen, activeP2PUserId, navigateTo]);  

  return (
    <div className="relative w-full min-h-screen overflow-x-hidden bg-[#0a0a0b]">
      {/* Connection status badge (fixed bottom right) */}
      {wsStatus !== 'connected' && session && (
        <div className="fixed bottom-24 right-6 z-50 bg-[#fee2e2] border border-red-200 text-red-800 px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg select-none">
          <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
          <span>{wsStatus === 'connecting' ? 'Reconectando...' : 'Desconectado'}</span>
        </div>
      )}

      {/* Floating Notifications (Toasts) */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none select-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              className="pointer-events-auto w-full bg-white/[0.03] backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-xl flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <span className={`material-symbols-outlined shrink-0 text-xl ${
                  n.tipo === 'error' ? 'text-red-500' :
                  n.tipo === 'warning' ? 'text-yellow-500' : 'text-indigo-400'
                }`}>
                  {n.tipo === 'error' ? 'error' : n.tipo === 'warning' ? 'warning' : 'info'}
                </span>
                <p className="text-xs text-gray-200 font-medium leading-relaxed flex-1">{n.mensaje}</p>
                {n.tipo !== 'invitation' && n.tipo !== 'call' && (
                  <button
                    onClick={() => removeNotification(n.id)}
                    className="text-gray-500 hover:text-gray-300 p-0.5 rounded-full"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                )}
              </div>
              {n.tipo === 'invitation' && (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      rejectP2PInvitation(n.metadata.deUserId);
                      removeNotification(n.id);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-[11px] font-bold text-gray-400 transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => {
                      acceptP2PInvitation(n.metadata.deUserId, n.metadata.senal);
                      removeNotification(n.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-bold text-white transition-all shadow-md shadow-indigo-600/20"
                  >
                    Aceptar
                  </button>
                </div>
              )}
              {n.tipo === 'call' && (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      rechazarLlamadaMedia();
                      removeNotification(n.id);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-[11px] font-bold text-gray-400 transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => {
                      aceptarLlamadaMedia();
                      removeNotification(n.id);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white transition-all shadow-md shadow-emerald-600/20"
                  >
                    Aceptar
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Screen Routing & Transitions */}
      <AnimatePresence initial={false} custom={transitionDirection} mode="wait">
        <motion.div
          key={currentScreen}
          custom={transitionDirection}
          variants={screenVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="w-full min-h-screen"
        >
          {currentScreen === 'auth' && <Auth />}

          {currentScreen === 'mensajes-privados' && (
            <MensajesPrivados
              chatThreads={p2pThreads}
              onSelectThread={async (id, name) => {
                await startP2PChat(id, name);
                navigateTo('chat-privado', 'push');
              }}
              onNavigateToRooms={() => {
                navigateTo('lista-salas', 'none');
              }}
            />
          )}        

          {currentScreen === 'chat-privado' && activeP2PUserId && (
            <ChatPrivado
              messages={activeP2PMessages}
              targetUser={activeThread || { id: activeP2PUserId, name: 'Usuario P2P', avatar: '', isOnline: false, lastMessage: '', timeAgo: '', unreadCount: 0 }}
              onSendMessage={(text) => sendP2PMessage(activeP2PUserId, text)}
              onBack={() => {
                closeP2PChat(activeP2PUserId);
                navigateTo('mensajes-privados', 'push_back');
              }}
              onOpenLightbox={setLightboxImage}
            />
          )}

          {currentScreen === 'lista-salas' && (
            <ListaSalas
              rooms={rooms}
              onSelectRoom={(code) => {
                joinRoom(code);
                navigateTo('chat-sala', 'push');
              }}
              onNavigateToMessages={() => {
                navigateTo('mensajes-privados', 'none');
              }}
            />
          )}

          {currentScreen === 'chat-sala' && (
            <ChatSala
              messages={roomMessages}
              onSendMessage={sendRoomMessage}
              onBack={() => {
                navigateTo('lista-salas', 'push_back');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Media Call Overlay (sobre cualquier pantalla) */}
      {mediaCallState !== 'idle' && <LlamadaOverlay />}

      {/* Image Lightbox (sobre todo) */}
      {lightboxImage && <ImageLightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} />}
    </div>
  );
}
