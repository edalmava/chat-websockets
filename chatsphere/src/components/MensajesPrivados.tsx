import React, { useState } from 'react';
import { ChatThread } from '../types';
import { useChatStore } from '../stores/useChatStore';

interface MensajesPrivadosProps {
  onSelectAlex: () => void;
  onSelectThread?: (id: string, name: string) => void;
  onNavigateToRooms: () => void;
  chatThreads: ChatThread[];
}

export default function MensajesPrivados({
  onSelectAlex,
  onSelectThread,
  onNavigateToRooms,
  chatThreads,
}: MensajesPrivadosProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  const currentUser = useChatStore((state) => state.currentUser);
  const roomUsers = useChatStore((state) => state.roomUsers);
  const startP2PChat = useChatStore((state) => state.startP2PChat);
  const navigateTo = useChatStore((state) => state.navigateTo);

  const filteredThreads = chatThreads.filter((thread) =>
    thread.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleThreadClick = (thread: ChatThread) => {
    if (thread.id === 'alex') {
      onSelectAlex();
    } else if (onSelectThread) {
      onSelectThread(thread.id, thread.name);
    }
  };

  const handleUserStoryClick = (userId: string, displayName: string) => {
    if (onSelectThread) {
      onSelectThread(userId, displayName);
    } else {
      startP2PChat(userId, displayName);
      navigateTo('chat-privado', 'push');
    }
  };

  // Generar un color avatar a partir del nombre
  const getAvatarColor = (name: string) => {
    const colors = ['bg-blue-500', 'bg-red-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-pink-500', 'bg-cyan-500'];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Top App Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 glass-header flex justify-between items-center px-4 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-white/10 shadow-inner">
            <span className="material-symbols-outlined text-indigo-400">person</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none font-sans">
              ChatSphere
            </h1>
            <span className="text-[10px] text-gray-500 mt-1 block">Mensajes Privados</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-95 text-[#e4e1ee]">
            <span className="material-symbols-outlined text-xl">search</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="mt-16 px-4 pt-6 flex-1">
        {/* Search Field */}
        <div className="mb-6">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-gray-500">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111113] border border-white/10 rounded-full py-3 pl-12 pr-4 text-sm text-gray-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-500 outline-none"
              placeholder="Buscar mensajes..."
            />
          </div>
        </div>

        {/* Stories / Usuarios Conectados en la Sala Actual */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 px-1">
            Usuarios en la Sala
          </h2>
          <div className="overflow-x-auto flex gap-4 pb-2 scrollbar-none">
            {/* Story del Usuario Logueado */}
            <div className="flex flex-col items-center gap-1.5 shrink-0 cursor-default">
              <div className="w-14 h-14 rounded-full border border-dashed border-indigo-500/40 p-0.5">
                <div className="w-full h-full rounded-full bg-[#111113] flex items-center justify-center overflow-hidden">
                  <span className="text-xs font-bold text-gray-500 font-sans">Tú</span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-gray-400 truncate max-w-[70px]">
                {currentUser?.displayName.split(' ')[0]}
              </span>
            </div>

            {/* Listar usuarios de la sala actual como historias (excluyendo a uno mismo) */}
            {roomUsers.filter(u => u.userId !== currentUser?.id).map((user) => (
              <div
                key={user.userId}
                onClick={() => handleUserStoryClick(user.userId, user.displayName)}
                className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
                title={`Iniciar chat WebRTC con ${user.displayName}`}
              >
                <div className="relative w-14 h-14">
                  <div className={`w-full h-full rounded-full object-cover border border-emerald-500/45 flex items-center justify-center text-white font-bold text-sm ${getAvatarColor(user.displayName)}`}>
                    {user.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#0a0a0b]"></div>
                </div>
                <span className="text-[11px] font-medium text-gray-400 group-hover:text-white transition-colors truncate max-w-[70px] font-sans">
                  {user.displayName.split(' ')[0]}
                </span>
              </div>
            ))}

            {roomUsers.filter(u => u.userId !== currentUser?.id).length === 0 && (
              <div className="flex items-center text-xs text-gray-500 py-4 px-2 italic">
                No hay otros usuarios en la sala.
              </div>
            )}
          </div>
        </div>

        {/* Recent Chats Section */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 px-1">
            Chats Privados Activos
          </h2>

          <div className="flex flex-col gap-2.5">
            {filteredThreads.map((thread) => {
              const isUnread = thread.unreadCount > 0;
              const hasColor = getAvatarColor(thread.name);

              return (
                <div
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-200 bg-[#111113] border border-white/5 cursor-pointer hover:bg-white/5 hover:border-white/10 active:scale-[0.99] ${
                    isUnread ? 'bg-indigo-500/5 border-indigo-500/30 shadow-indigo-500/5 shadow-sm' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg ${hasColor}`}>
                      {thread.name.substring(0, 2).toUpperCase()}
                    </div>
                    {thread.isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#111113] active-dot"></div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-base text-gray-100 truncate font-sans">
                        {thread.name}
                      </h3>
                      <span className={`text-[11px] ${isUnread ? 'text-indigo-400 font-semibold' : 'text-gray-500'}`}>
                        {thread.timeAgo}
                      </span>
                    </div>
                    <p className={`text-sm truncate font-sans ${isUnread ? 'text-gray-200 font-semibold' : 'text-gray-400'}`}>
                      {thread.lastMessage}
                    </p>
                  </div>

                  {isUnread && (
                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full shrink-0"></div>
                  )}
                </div>
              );
            })}

            {filteredThreads.length === 0 && (
              <div className="text-center py-10 bg-[#111113]/40 border border-dashed border-white/5 rounded-2xl">
                <span className="material-symbols-outlined text-4xl text-gray-600 block mb-2">forum</span>
                <p className="text-xs text-gray-500 font-sans">No tienes chats privados activos.</p>
                <p className="text-[10px] text-gray-600 mt-1 font-sans">Haz clic en un usuario de arriba para iniciar.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl glass-header border-t border-white/5 flex justify-around items-center h-20 px-2 pb-safe shadow-2xl">
        {/* Rooms Button */}
        <button
          onClick={onNavigateToRooms}
          className="flex flex-col items-center justify-center text-gray-400 hover:text-indigo-400 transition-all active:scale-95 duration-200 h-16 w-16"
        >
          <span className="material-symbols-outlined mb-1 text-2xl">forum</span>
          <span className="text-[12px] font-bold tracking-wide">Rooms</span>
        </button>

        {/* Messages: Active State */}
        <button className="flex flex-col items-center justify-center text-white bg-indigo-600 rounded-2xl h-12 px-5 gap-0.5 transition-all active:scale-95 duration-200 my-auto shadow-lg shadow-indigo-600/20 border border-indigo-500/30">
          <span className="material-symbols-outlined text-xl font-variation-settings-'FILL'-1 material-symbols-fill">chat_bubble</span>
          <span className="text-[11px] font-bold">Messages</span>
        </button>

        {/* Search button (stub) */}
        <button className="flex flex-col items-center justify-center text-gray-400 hover:text-indigo-400 transition-all active:scale-95 duration-200 h-16 w-16">
          <span className="material-symbols-outlined mb-1 text-2xl">search</span>
          <span className="text-[12px] font-semibold text-gray-500">Search</span>
        </button>

        {/* Settings button (stub) */}
        <button className="flex flex-col items-center justify-center text-gray-400 hover:text-indigo-400 transition-all active:scale-95 duration-200 h-16 w-16">
          <span className="material-symbols-outlined mb-1 text-2xl">settings</span>
          <span className="text-[12px] font-semibold text-gray-500">Settings</span>
        </button>
      </nav>
    </div>
  );
}
