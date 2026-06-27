import React, { useState } from 'react';
import { Room } from '../types';
import { useChatStore } from '../stores/useChatStore';

interface ListaSalasProps {
  onSelectRoom: (code: string) => void;
  onNavigateToMessages: () => void;
  rooms: Room[];
}

export default function ListaSalas({
  onSelectRoom,
  onNavigateToMessages,
  rooms,
}: ListaSalasProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const logout = useChatStore((state) => state.logout);
  const currentUser = useChatStore((state) => state.currentUser);

  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoomClick = (roomCode: string) => {
    onSelectRoom(roomCode);
  };

  // Obtener estadísticas globales dinámicas
  const totalOnline = rooms.reduce((acc, r) => acc + r.onlineCount, 0);

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* Top App Bar Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 glass-header flex justify-between items-center px-4 shadow-sm select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 overflow-hidden shadow-inner">
            <span className="material-symbols-outlined text-indigo-400">person</span>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none font-sans">
              {currentUser?.displayName || 'Usuario'}
            </h1>
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-0.5 block">{currentUser?.role || 'user'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => logout()}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 duration-200 text-red-400"
            title="Cerrar sesión"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>
      </header>

      {/* Main content viewport */}
      <main className="pt-20 px-4 space-y-5">
        {/* Search Field */}
        <div>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-gray-500">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111113] border border-white/10 rounded-full py-3 pl-12 pr-4 text-sm text-gray-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-500 outline-none"
              placeholder="Buscar salas..."
            />
          </div>
        </div>

        {/* Statistics section */}
        <section className="grid grid-cols-2 gap-4">
          <div className="glass p-4 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/15 transition-all duration-300"></div>
            <span className="material-symbols-outlined text-indigo-400 text-2xl">hub</span>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Activos en Sala</p>
              <p className="text-2xl font-bold text-white tracking-tight mt-0.5">{totalOnline}</p>
            </div>
          </div>

          <div className="glass p-4 rounded-2xl flex flex-col justify-between h-32 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/15 transition-all duration-300"></div>
            <span className="material-symbols-outlined text-emerald-400 text-2xl">explore</span>
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Salas Disponibles</p>
              <p className="text-2xl font-bold text-white tracking-tight mt-0.5">{rooms.length}</p>
            </div>
          </div>
        </section>

        {/* Room items list */}
        <div className="space-y-3.5 pt-1">
          {filteredRooms.map((room) => {
            const code = room.id || room.code;
            return (
              <div
                key={room.id}
                onClick={() => handleRoomClick(code)}
                className="glass p-4 rounded-2xl group transition-all duration-300 bg-[#111113] border border-white/5 cursor-pointer hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.99]"
              >
                <div className="flex items-start gap-4">
                  {/* Icon thumb */}
                  <div className="w-13 h-13 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <span className="material-symbols-outlined text-indigo-400 text-3xl">
                      {room.icon}
                    </span>
                  </div>

                  {/* Body textual content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <h3 className="font-bold text-base text-white truncate">
                        {room.name}
                      </h3>
                      {room.onlineCount > 0 && (
                        <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shrink-0 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          {room.onlineCount} Online
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed font-sans">
                      {room.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredRooms.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <span className="material-symbols-outlined text-4xl block mb-2">search_off</span>
              <p className="text-sm">No se encontraron salas disponibles.</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl glass-header border-t border-white/5 flex justify-around items-center h-20 px-2 pb-safe shadow-2xl">
        {/* Rooms: Active State */}
        <button className="flex flex-col items-center justify-center text-white bg-indigo-600 rounded-2xl h-12 px-6 gap-0.5 transition-all active:scale-95 duration-200 my-auto shadow-lg shadow-indigo-600/20 border border-indigo-500/30">
          <span className="material-symbols-outlined text-xl font-variation-settings-'FILL'-1 material-symbols-fill">forum</span>
          <span className="text-[11px] font-bold">Rooms</span>
        </button>

        {/* Messages Button */}
        <a
          href="#messages"
          onClick={(e) => {
            e.preventDefault();
            onNavigateToMessages();
          }}
          className="flex flex-col items-center justify-center text-gray-400 hover:text-indigo-400 transition-all active:scale-95 duration-200 h-16 w-16"
        >
          <span className="material-symbols-outlined mb-1 text-2xl">chat_bubble</span>
          <span className="text-[12px] font-bold tracking-wide">Messages</span>
        </a>

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
