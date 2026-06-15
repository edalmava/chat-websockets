import React, { useState, useRef, useEffect } from 'react';
import { Message, ChatThread } from '../types';
import { useChatStore } from '../stores/useChatStore';

interface ChatPrivadoProps {
  onBack: () => void;
  messages: Message[];
  targetUser: ChatThread;
  onSendMessage: (text: string) => void;
}

export default function ChatPrivado({
  onBack,
  messages,
  targetUser,
  onSendMessage,
}: ChatPrivadoProps) {
  const [typedMessage, setTypedMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Obtener estados P2P del store de Zustand
  const p2pConnectionStatus = useChatStore((state) => state.p2pConnectionStatus[targetUser.id]);
  const p2pTypingStatus = useChatStore((state) => state.p2pTypingStatus[targetUser.id]);
  const sendP2PTyping = useChatStore((state) => state.sendP2PTyping);
  const marcarVistoP2P = useChatStore((state) => state.marcarVistoP2P);

  const [escribiendoLocal, setEscribiendoLocal] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll al final del chat
  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Al montar: scroll inicial + marcar todos los mensajes como vistos
  useEffect(() => {
    scrollToBottom('auto');
    marcarVistoP2P(targetUser.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar

  // Scroll suave al llegar nuevos mensajes — SIN marcar visto aquí
  // (el backend ya dispara el callback onP2PMessageReceived que lo gestiona)
  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]); // Solo depende de messages, no actualiza estado

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim()) return;
    onSendMessage(typedMessage.trim());
    setTypedMessage('');
    
    if (escribiendoLocal) {
      setEscribiendoLocal(false);
      sendP2PTyping(targetUser.id, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTypedMessage(e.target.value);
    
    // Gestión del typing indicator P2P
    if (!escribiendoLocal) {
      setEscribiendoLocal(true);
      sendP2PTyping(targetUser.id, true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setEscribiendoLocal(false);
      sendP2PTyping(targetUser.id, false);
    }, 3000);
  };

  // Limpiar el timeout al desmontar
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Formatear estado de conexión
  const getStatusText = () => {
    if (p2pTypingStatus) return 'escribiendo...';
    
    const status = p2pConnectionStatus ? p2pConnectionStatus.toLowerCase() : '';
    if (status === 'connected' || status === 'open') return 'Conectado (P2P)';
    if (status === 'connecting' || status === 'checking') return 'Conectando WebRTC...';
    return 'Desconectado';
  };

  const isConnected = p2pConnectionStatus === 'connected' || p2pConnectionStatus === 'open';

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] flex flex-col h-screen overflow-hidden">
      {/* Target header bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 glass-header flex justify-between items-center px-4 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="active:scale-95 transition-transform duration-200 text-gray-400 hover:bg-white/10 p-2 rounded-full flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-indigo-600 border border-white/15">
                {targetUser.name.substring(0, 2).toUpperCase()}
              </div>
              {isConnected && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#0a0a0b] rounded-full"></div>
              )}
            </div>
            <div>
              <h2 className="font-semibold text-sm text-white leading-tight font-sans">{targetUser.name}</h2>
              <p className={`text-[10px] font-bold font-sans mt-0.5 ${
                p2pTypingStatus ? 'text-indigo-400 animate-pulse' :
                isConnected ? 'text-emerald-400' : 'text-gray-500'
              }`}>
                {getStatusText()}
              </p>
            </div>
          </div>
        </div>

        {/* Right Buttons */}
        <div className="flex items-center gap-1.5">
          <button className="active:scale-95 transition-transform text-gray-400 hover:bg-white/10 p-2 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">videocam</span>
          </button>
          <button className="active:scale-95 transition-transform text-gray-400 hover:bg-white/10 p-2 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">call</span>
          </button>
        </div>
      </header>

      {/* Main Messages Drawer Scroll Container */}
      <main className="flex-1 overflow-y-auto px-4 pt-18 pb-28 custom-scrollbar">
        {/* Timestamp Separator */}
        <div className="text-center my-6 select-none">
          <span className="text-[11px] font-bold bg-[#111113] text-gray-500 px-4 py-1.5 rounded-full uppercase tracking-wider border border-white/10 shadow-sm font-sans">
            Hoy
          </span>
        </div>

        {/* Messages Stream */}
        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            if (msg.isSentByMe) {
              return (
                <div key={msg.id} className="flex flex-col gap-1 max-w-[85%] self-end items-end mt-1">
                  <div className="flex items-end gap-2 flex-row-reverse">
                    <div className="bg-indigo-600 shadow-md shadow-indigo-600/10 px-4 py-2.5 rounded-2xl rounded-tr-xs text-white select-text">
                      <p className="text-sm font-sans whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                    <div className="flex flex-col items-end shrink-0 select-none">
                      <span className="text-[9px] text-gray-500">{msg.timestamp}</span>
                      {msg.status === 'read' ? (
                        <span className="material-symbols-outlined text-[12px] text-indigo-400 material-symbols-fill leading-none">done_all</span>
                      ) : (
                        <span className="material-symbols-outlined text-[12px] text-gray-600 leading-none">done</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={msg.id} className="flex flex-col gap-1 max-w-[85%] self-start items-start mt-1">
                  <div className="flex items-end gap-2">
                    <div className="glass px-4 py-2.5 rounded-2xl rounded-tl-xs text-gray-100 select-text">
                      <p className="text-sm font-sans whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                    <span className="text-[9px] text-gray-500 pb-1 select-none">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }
          })}

          {/* Typing indicator widget */}
          {p2pTypingStatus && (
            <div className="flex items-center gap-2 mt-2 self-start transition-opacity duration-300 select-none">
              <div className="glass px-4 py-2.5 rounded-full flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500 font-sans">{targetUser.name.split(' ')[0]} está escribiendo...</span>
            </div>
          )}

          {/* Dummy element used as scrolling anchor */}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Persistent typing field bar */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 px-4 pt-3 pb-8 z-50">
        <form onSubmit={handleSend} className="flex items-center gap-2.5">
          <button
            type="button"
            className="text-gray-400 hover:bg-white/10 p-2.5 rounded-full transition-colors active:scale-95 flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-xl">add</span>
          </button>

          <div className="flex-1 glass rounded-full flex items-center px-4 py-1.5 h-11 border border-white/5 focus-within:border-indigo-500/30 transition-all">
            <input
              id="message-input"
              type="text"
              value={typedMessage}
              onChange={handleInputChange}
              placeholder={isConnected ? 'Escribe un mensaje privado P2P...' : 'Conexión WebRTC no establecida'}
              disabled={!isConnected}
              className="bg-transparent border-none outline-none focus:ring-0 w-full text-sm text-gray-100 placeholder:text-gray-500 font-sans"
            />
            <button
              type="button"
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <span className="material-symbols-outlined text-xl">mood</span>
            </button>
          </div>

          <button
            id="send-button"
            type="submit"
            disabled={!typedMessage.trim() || !isConnected}
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 transform shrink-0 ${
              typedMessage.trim() && isConnected
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 active:scale-95'
                : 'bg-[#111113] text-gray-600 border border-white/5 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-xl font-variation-settings-'FILL'-1 material-symbols-fill">send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
