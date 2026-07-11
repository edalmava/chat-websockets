import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, ChatThread } from '../types';
import { useChatStore } from '../stores/useChatStore';
import * as webrtcManager from '../utils/webrtcManager';

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip',
]);

interface ChatPrivadoProps {
  onBack: () => void;
  messages: Message[];
  targetUser: ChatThread;
  onSendMessage: (text: string) => void;
  onOpenLightbox?: (imageUrl: string) => void;
}

export default function ChatPrivado({
  onBack,
  messages,
  targetUser,
  onSendMessage,
  onOpenLightbox,
}: ChatPrivadoProps) {
  const [typedMessage, setTypedMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File preview state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Obtener estados P2P del store de Zustand
  const p2pConnectionStatus = useChatStore((state) => state.p2pConnectionStatus[targetUser.id]);
  const p2pTypingStatus = useChatStore((state) => state.p2pTypingStatus[targetUser.id]);
  const sendP2PTyping = useChatStore((state) => state.sendP2PTyping);
  const marcarVistoP2P = useChatStore((state) => state.marcarVistoP2P);
  const terminarP2PChat = useChatStore((state) => state.terminarP2PChat);
  const sendP2PFile = useChatStore((state) => state.sendP2PFile);
  const cancelarTransferenciaP2P = useChatStore((state) => state.cancelarTransferenciaP2P);
  const fileTransferProgress = useChatStore((state) => state.fileTransferProgress[targetUser.id]);

  // Media call state
  const mediaCallState = useChatStore((state) => state.mediaCallState);
  const mediaCallType = useChatStore((state) => state.mediaCallType);
  const mediaCallTargetUserId = useChatStore((state) => state.mediaCallTargetUserId);
  const iniciarLlamadaMedia = useChatStore((state) => state.iniciarLlamadaMedia);
  const estaEnLlamada = mediaCallState === 'connected' || mediaCallState === 'calling' || mediaCallState === 'ringing';
  const esLlamadaActiva = mediaCallState === 'connected' && mediaCallTargetUserId === targetUser.id;

  const [escribiendoLocal, setEscribiendoLocal] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
    marcarVistoP2P(targetUser.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

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

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      useChatStore.getState().addNotification('error', 'Tipo de archivo no permitido.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      useChatStore.getState().addNotification('error', 'El archivo excede el límite de 50MB.');
      return;
    }

    setSelectedFile(file);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
  }, [filePreviewUrl]);

  const handleSendFile = async () => {
    if (!selectedFile) return;
    const file = selectedFile;
    setSelectedFile(null);
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); }
    await sendP2PFile(targetUser.id, file);
  };

  const handleCancelFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) { URL.revokeObjectURL(filePreviewUrl); setFilePreviewUrl(null); }
  };

  const getStatusText = () => {
    if (esLlamadaActiva) {
      if (mediaCallType === 'video') return 'En videollamada';
      return 'En llamada de voz';
    }
    if (mediaCallTargetUserId === targetUser.id && mediaCallState === 'ringing') return 'Llamada entrante...';
    if (fileTransferProgress) {
      const pct = Math.round((fileTransferProgress.sent / fileTransferProgress.total) * 100);
      return `Enviando archivo... ${pct}%`;
    }
    if (p2pTypingStatus) return 'escribiendo...';

    const status = p2pConnectionStatus ? p2pConnectionStatus.toLowerCase() : '';
    if (status === 'connected' || status === 'open') return 'Conectado (P2P)';
    if (status === 'connecting' || status === 'checking') return 'Conectando WebRTC...';
    return 'Desconectado';
  };

  const isConnected = p2pConnectionStatus === 'connected' || p2pConnectionStatus === 'open';

  const renderFileContent = (msg: Message, isMine: boolean) => {
    if (!msg.fileUrl) return null;

    if (msg.fileType?.startsWith('image/')) {
      return (
        <img
          src={msg.fileUrl}
          alt={msg.fileName}
          className="max-w-full max-h-[300px] rounded-lg object-cover cursor-pointer active:scale-[0.98] transition-transform"
          onClick={() => onOpenLightbox?.(msg.fileUrl!)}
          loading="lazy"
        />
      );
    }

    return (
      <a
        href={msg.fileUrl}
        download={msg.fileName}
        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
          isMine ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 hover:bg-white/10'
        }`}
      >
        <span className="material-symbols-outlined text-3xl text-indigo-400 shrink-0">
          {webrtcManager.obtenerIconoArchivo(msg.fileType)}
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-white truncate">{msg.fileName}</span>
          <span className="text-[10px] text-gray-400">{webrtcManager.formatearTamanoArchivo(msg.fileSize || 0)}</span>
        </div>
        <span className="material-symbols-outlined text-lg text-gray-400 shrink-0 ml-auto">download</span>
      </a>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] flex flex-col h-screen overflow-hidden">
      {/* Header */}
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
                esLlamadaActiva ? 'text-indigo-400' :
                p2pTypingStatus ? 'text-indigo-400 animate-pulse' :
                fileTransferProgress ? 'text-amber-400' :
                isConnected ? 'text-emerald-400' : 'text-gray-500'
              }`}>
                {getStatusText()}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => terminarP2PChat(targetUser.id)}
            className="active:scale-95 transition-transform text-red-400 hover:bg-red-500/15 p-2 rounded-full flex items-center justify-center"
            title="Finalizar chat P2P"
          >
            <span className="material-symbols-outlined text-xl">link_off</span>
          </button>
          <button
            onClick={() => iniciarLlamadaMedia(targetUser.id, 'video')}
            disabled={!isConnected || estaEnLlamada}
            className={`active:scale-95 transition-transform p-2 rounded-full flex items-center justify-center ${
              esLlamadaActiva && mediaCallType === 'video'
                ? 'text-indigo-400 bg-indigo-500/15'
                : !isConnected || estaEnLlamada
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:bg-white/10'
            }`}
            title={esLlamadaActiva ? 'En videollamada' : 'Iniciar videollamada'}
          >
            <span className={`material-symbols-outlined text-xl ${esLlamadaActiva ? 'material-symbols-fill' : ''}`}>videocam</span>
          </button>
          <button
            onClick={() => iniciarLlamadaMedia(targetUser.id, 'voice')}
            disabled={!isConnected || estaEnLlamada}
            className={`active:scale-95 transition-transform p-2 rounded-full flex items-center justify-center ${
              esLlamadaActiva && mediaCallType === 'voice'
                ? 'text-indigo-400 bg-indigo-500/15'
                : !isConnected || estaEnLlamada
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:bg-white/10'
            }`}
            title={esLlamadaActiva ? 'En llamada de voz' : 'Iniciar llamada de voz'}
          >
            <span className={`material-symbols-outlined text-xl ${esLlamadaActiva ? 'material-symbols-fill' : ''}`}>call</span>
          </button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 pt-18 pb-28 custom-scrollbar">
        <div className="text-center my-6 select-none">
          <span className="text-[11px] font-bold bg-[#111113] text-gray-500 px-4 py-1.5 rounded-full uppercase tracking-wider border border-white/10 shadow-sm font-sans">
            Hoy
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {messages.map((msg) => {
            const hasFile = !!msg.fileUrl;
            if (msg.isSentByMe) {
              return (
                <div key={msg.id} className="flex flex-col gap-1 max-w-[85%] self-end items-end mt-1">
                  <div className="flex items-end gap-2 flex-row-reverse">
                    <div className={`shadow-md shadow-indigo-600/10 px-4 py-2.5 rounded-2xl rounded-tr-xs text-white select-text ${
                      hasFile ? 'bg-indigo-600/80 p-2' : 'bg-indigo-600'
                    }`}>
                      {hasFile ? renderFileContent(msg, true) : (
                        <p className="text-sm font-sans whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      )}
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
                    <div className={`glass px-4 py-2.5 rounded-2xl rounded-tl-xs text-gray-100 select-text ${
                      hasFile ? 'p-2' : ''
                    }`}>
                      {hasFile ? renderFileContent(msg, false) : (
                        <p className="text-sm font-sans whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-500 pb-1 select-none">{msg.timestamp}</span>
                  </div>
                </div>
              );
            }
          })}

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

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/5 px-4 pt-3 pb-8 z-50">
        {/* File preview card */}
        {selectedFile && (
          <div className="mb-2 flex items-center gap-3 bg-[#111113] rounded-xl px-3 py-2 border border-white/10">
            {filePreviewUrl ? (
              <img src={filePreviewUrl} alt="Preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="material-symbols-outlined text-2xl text-indigo-400 shrink-0">
                {webrtcManager.obtenerIconoArchivo(selectedFile.type)}
              </span>
            )}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs text-white truncate">{selectedFile.name}</span>
              <span className="text-[10px] text-gray-400">{webrtcManager.formatearTamanoArchivo(selectedFile.size)}</span>
            </div>
            <button
              type="button"
              onClick={handleCancelFile}
              className="text-gray-400 hover:text-red-400 p-1 rounded-full transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
            <button
              type="button"
              onClick={handleSendFile}
              disabled={!isConnected}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white shrink-0 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </div>
        )}

        {/* Sending progress bar */}
        {fileTransferProgress && (
          <div className="mb-2 px-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400 truncate max-w-[200px]">Enviando {fileTransferProgress.fileName}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">
                  {Math.round((fileTransferProgress.sent / fileTransferProgress.total) * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => fileTransferProgress && cancelarTransferenciaP2P(targetUser.id, fileTransferProgress.fileId)}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${(fileTransferProgress.sent / fileTransferProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isConnected}
            className="text-gray-400 hover:bg-white/10 p-2.5 rounded-full transition-colors active:scale-95 flex items-center justify-center shrink-0 disabled:text-gray-600 disabled:cursor-not-allowed"
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
