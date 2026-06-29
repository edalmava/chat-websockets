import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useChatStore } from '../stores/useChatStore';
import * as webrtcManager from '../utils/webrtcManager';

export default function LlamadaOverlay() {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const mediaCallState = useChatStore((s) => s.mediaCallState);
  const mediaCallType = useChatStore((s) => s.mediaCallType);
  const mediaCallTargetUserId = useChatStore((s) => s.mediaCallTargetUserId);
  const p2pThreads = useChatStore((s) => s.p2pThreads);
  const finalizarLlamadaMedia = useChatStore((s) => s.finalizarLlamadaMedia);
  const rechazarLlamadaMedia = useChatStore((s) => s.rechazarLlamadaMedia);
  const alternarMicrofono = useChatStore((s) => s.alternarMicrofono);
  const alternarCamara = useChatStore((s) => s.alternarCamara);

  const [micActivo, setMicActivo] = useState(true);
  const [camActivo, setCamActivo] = useState(true);
  const [duracion, setDuracion] = useState(0);

  const targetThread = p2pThreads.find((t) => t.id === mediaCallTargetUserId);
  const displayName = targetThread?.name || 'Usuario';
  const isRinging = mediaCallState === 'ringing';
  const isCalling = mediaCallState === 'calling';
  const isConnected = mediaCallState === 'connected';

  // Conectar streams a los elementos <video>
  useEffect(() => {
    if (isConnected || isCalling) {
      const local = webrtcManager.obtenerStreamLocal();
      if (local && localVideoRef.current) {
        localVideoRef.current.srcObject = local;
      }
    }
  }, [isConnected, isCalling]);

  useEffect(() => {
    if (isConnected) {
      const remote = webrtcManager.obtenerStreamRemoto();
      if (remote && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote;
      }
      if (remote && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
      }
    }
  }, [isConnected]);

  // Escuchar nuevos streams remotos (ontrack puede dispararse después del render)
  useEffect(() => {
    if (!isConnected) return;
    const checkInterval = setInterval(() => {
      const remote = webrtcManager.obtenerStreamRemoto();
      if (remote && remoteVideoRef.current && remoteVideoRef.current.srcObject !== remote) {
        remoteVideoRef.current.srcObject = remote;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remote && remoteAudioRef.current && remoteAudioRef.current.srcObject !== remote) {
        remoteAudioRef.current.srcObject = remote;
        remoteAudioRef.current.play().catch(() => {});
      }
      const local = webrtcManager.obtenerStreamLocal();
      if (local && localVideoRef.current && localVideoRef.current.srcObject !== local) {
        localVideoRef.current.srcObject = local;
        localVideoRef.current.play().catch(() => {});
      }
    }, 500);
    return () => clearInterval(checkInterval);
  }, [isConnected]);

  // Timer de duración
  useEffect(() => {
    if (!isConnected) {
      setDuracion(0);
      return;
    }
    const interval = setInterval(() => {
      setDuracion((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const formatearDuracion = useCallback(() => {
    const m = Math.floor(duracion / 60);
    const s = duracion % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [duracion]);

  const toggleMic = () => {
    const nuevo = !micActivo;
    setMicActivo(nuevo);
    alternarMicrofono(nuevo);
  };

  const toggleCam = () => {
    const nuevo = !camActivo;
    setCamActivo(nuevo);
    alternarCamara(nuevo);
  };

  if (mediaCallState === 'idle') return null;

  const isVideo = mediaCallType === 'video';
  const isVoice = mediaCallType === 'voice';

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center select-none">
      {/* Video remoto (solo en videollamada) */}
      {isVideo && isConnected && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Audio remoto (solo en llamada de voz) */}
      {isVoice && isConnected && (
        <audio ref={remoteAudioRef} autoPlay />
      )}

      {/* Fondo con avatar en llamada de voz o ringing */}
      {(!isVideo || !isConnected) && (
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-24 h-24 rounded-full bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-indigo-600/30">
            {displayName.substring(0, 2).toUpperCase()}
          </div>
          <h2 className="text-white text-xl font-bold">{displayName}</h2>
          <p className="text-gray-400 text-sm font-medium">
            {isRinging && 'Llamada entrante...'}
            {isCalling && 'Llamando...'}
            {isConnected && isVoice && formatearDuracion()}
            {isConnected && isVideo && formatearDuracion()}
          </p>
        </div>
      )}

      {/* Info de duración sobre el video (modo video conectado) */}
      {isVideo && isConnected && (
        <div className="absolute top-6 left-0 right-0 flex flex-col items-center gap-1 z-10">
          <h2 className="text-white text-lg font-bold drop-shadow-lg">{displayName}</h2>
          <p className="text-gray-300 text-sm font-medium drop-shadow-lg">{formatearDuracion()}</p>
        </div>
      )}

      {/* Video local (PiP) — solo en videollamada conectada */}
      {isVideo && (isConnected || isCalling) && (
        <div className="absolute bottom-28 right-4 w-32 h-48 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl z-10">
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Botón colgar (rojo) — siempre visible cuando no idle */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8 z-10">
        {isConnected && (
          <>
            <button
              onClick={toggleMic}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                micActivo ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-400'
              }`}
              title={micActivo ? 'Silenciar micrófono' : 'Activar micrófono'}
            >
              <span className="material-symbols-outlined text-2xl">
                {micActivo ? 'mic' : 'mic_off'}
              </span>
            </button>

            {isVideo && (
              <button
                onClick={toggleCam}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  camActivo ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-400'
                }`}
                title={camActivo ? 'Apagar cámara' : 'Encender cámara'}
              >
                <span className="material-symbols-outlined text-2xl">
                  {camActivo ? 'videocam' : 'videocam_off'}
                </span>
              </button>
            )}
          </>
        )}

        {(isRinging || isCalling) && (
          <button
            onClick={isRinging ? rechazarLlamadaMedia : finalizarLlamadaMedia}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
            title={isRinging ? 'Rechazar llamada' : 'Colgar'}
          >
            <span className="material-symbols-outlined text-3xl">call_end</span>
          </button>
        )}

        {isConnected && (
          <button
            onClick={finalizarLlamadaMedia}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
            title="Finalizar llamada"
          >
            <span className="material-symbols-outlined text-3xl">call_end</span>
          </button>
        )}
      </div>

      {/* Botones Aceptar/Rechazar solo en ringing */}
      {isRinging && (
        <div className="absolute bottom-28 left-0 right-0 flex items-center justify-center gap-10 z-10">
          <button
            onClick={rechazarLlamadaMedia}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
            title="Rechazar"
          >
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
          <button
            onClick={() => useChatStore.getState().aceptarLlamadaMedia()}
            className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all shadow-emerald-600/30"
            title="Aceptar"
          >
            <span className="material-symbols-outlined text-3xl">
              {isVideo ? 'videocam' : 'call'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
