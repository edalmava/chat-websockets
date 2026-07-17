import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Screen, Message, Room, ChatThread, RoomUser, CallState } from '../types';
import { 
  supabaseClient, 
  obtenerSesion, 
  onCambioEstadoAuth, 
  obtenerToken, 
  iniciarSesion, 
  registrarUsuario, 
  cerrarSesion, 
  actualizarPerfil, 
  obtenerUsuario, 
  cambiarContrasena, 
  recuperarContrasena,
  reenviarConfirmacionEmail
} from '../utils/supabaseClient';
import * as wsManager from '../utils/wsManager';
import * as webrtcManager from '../utils/webrtcManager';

interface ChatNotification {
  id: string;
  tipo: 'info' | 'warning' | 'error' | 'success' | 'invitation' | 'call';
  mensaje: string;
  metadata?: any;
}

interface ChatState {
  // Estados
  currentScreen: Screen;
  transitionDirection: 'push' | 'push_back' | 'none';
  session: Session | null;
  currentUser: { id: string; displayName: string; role: 'user' | 'moderator' | 'admin' } | null;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  wsInitializing: boolean; // Guard: evita dobles conexiones simultáneas
  rooms: Room[];
  currentRoomCode: string;
  roomMessages: Message[];
  roomUsers: RoomUser[];
  typingUsers: string[];
  
  // WebRTC / P2P
  p2pThreads: ChatThread[];
  p2pMessages: Record<string, Message[]>; // targetUserId -> Message[]
  activeP2PUserId: string | null;
  p2pConnectionStatus: Record<string, string>; // targetUserId -> status
  p2pTypingStatus: Record<string, boolean>; // targetUserId -> escribiendo
  previousP2PConnections: Record<string, string>; // targetUserId -> displayName (para restaurar tras reconexión WS)
  
  // Media Call (video/voice)
  mediaCallState: CallState;
  mediaCallType: 'video' | 'voice' | null;
  mediaCallTargetUserId: string | null;

  // File Transfer
  fileTransferProgress: Record<string, { fileId: string; sent: number; total: number; fileName: string }>; // targetUserId -> progress
  fileReceivingProgress: Record<string, { received: number; total: number; fileName: string }>; // targetUserId -> progress

  // Silencio / Mute
  isMuted: boolean;
  muteDurationRemaining: number;
  
  // Offsets de mensajes para catch-up en reconexión
  lastOffsets: Record<string, string>; // roomCode → último offset Redis conocido

  // Notificaciones Toast
  notifications: ChatNotification[];

  // Perfil - edición
  isEditingProfile: boolean;

  // Acciones
  inicializarChat: () => Promise<void>;
  conectarWS: () => Promise<void>;
  navigateTo: (screen: Screen, direction?: 'push' | 'push_back' | 'none') => void;
  
  // Auth
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (displayName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  
  // Perfil
  updateProfile: (displayName: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  resendEmailConfirmation: (email: string) => Promise<{ success: boolean; error?: string }>;
  setEditingProfile: (editing: boolean) => void;
  
  // Salas / Mensajes Públicos
  joinRoom: (roomCode: string) => void;
  sendRoomMessage: (text: string) => void;
  sendPublicTyping: (escribiendo: boolean) => void;
  
  // WebRTC P2P
  startP2PChat: (targetUserId: string, displayName: string) => Promise<void>;
  sendP2PMessage: (targetUserId: string, text: string) => void;
  sendP2PTyping: (targetUserId: string, escribiendo: boolean) => void;
  acceptP2PInvitation: (deUserId: string, senal: any) => Promise<void>;
  rejectP2PInvitation: (deUserId: string) => void;
  closeP2PChat: (targetUserId: string) => void;
  terminarP2PChat: (targetUserId: string) => void;
  reconnectP2P: (targetUserId: string) => Promise<void>;
  marcarVistoP2P: (targetUserId: string) => void;
  
  // Media Call
  iniciarLlamadaMedia: (targetUserId: string, tipo: 'video' | 'voice') => Promise<void>;
  aceptarLlamadaMedia: () => Promise<void>;
  rechazarLlamadaMedia: () => void;
  finalizarLlamadaMedia: () => void;
  alternarMicrofono: (activo: boolean) => void;
  alternarCamara: (activo: boolean) => void;

  // File Transfer
  sendP2PFile: (targetUserId: string, file: File) => Promise<void>;
  cancelarTransferenciaP2P: (targetUserId: string, fileId: string) => void;

  // Moderación / Admin
  kickUser: (userId: string, motivo: string) => void;
  muteUser: (userId: string, duracion: number) => void;
  changeUserRole: (userId: string, nuevoRol: 'user' | 'moderator' | 'admin') => void;
  
  // Helper Toasts
  addNotification: (tipo: ChatNotification['tipo'], mensaje: string, metadata?: any, duracion?: number) => void;
  removeNotification: (id: string) => void;
}

function generarRoomMeta(salaNombre: string): { icon: string; description: string } {
  const n = salaNombre.toLowerCase();
  if (n.includes('general')) return { icon: 'public', description: 'Conéctate con todos en la comunidad global. Pensamientos compartidos, actualizaciones y más.' };
  if (n.includes('desarrollo')) return { icon: 'code', description: 'Discute sobre programación, frameworks y mejores prácticas de desarrollo.' };
  if (n.includes('soporte')) return { icon: 'support', description: 'Obtén ayuda técnica y resuelve dudas con la comunidad.' };
  if (n.includes('random')) return { icon: 'casino', description: 'Charlas sin rumbo fijo. Todo vale, mantén el respeto.' };
  if (n.includes('gaming')) return { icon: 'sports_esports', description: 'El punto de encuentro definitivo para gamers.' };
  if (n.includes('música') || n.includes('musica')) return { icon: 'music_note', description: 'Comparte y descubre música de todos los géneros.' };
  if (n.includes('cine')) return { icon: 'movie', description: 'Discute películas, series y todo sobre el séptimo arte.' };
  if (n.includes('deporte')) return { icon: 'sports', description: 'Sigue y debate sobre tus deportes y equipos favoritos.' };
  if (n.includes('tecnología') || n.includes('tecnologia')) return { icon: 'devices', description: 'Lo último en gadgets, innovación y tendencias tecnológicas.' };
  if (n.includes('off') || n.includes('topic')) return { icon: 'forum', description: 'Temas diversos que no encajan en otras categorías.' };
  return { icon: 'forum', description: 'Sala de chat de la comunidad.' };
}

/** Revoca ObjectURLs de archivos en mensajes P2P antes de eliminarlos del store */
function revocarUrlsArchivos(messages: Message[]) {
  for (const msg of messages) {
    if (msg.fileUrl && msg.fileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(msg.fileUrl);
    }
  }
}

const LAST_OFFSETS_KEY_PREFIX = 'lastOffsets_';

function cargarLastOffsets(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(`${LAST_OFFSETS_KEY_PREFIX}${userId}`) || '{}');
  } catch {
    return {};
  }
}

function guardarLastOffsets(userId: string, offsets: Record<string, string>) {
  localStorage.setItem(`${LAST_OFFSETS_KEY_PREFIX}${userId}`, JSON.stringify(offsets));
}

function limpiarLastOffsets(userId: string) {
  localStorage.removeItem(`${LAST_OFFSETS_KEY_PREFIX}${userId}`);
}

export const useChatStore = create<ChatState>((set, get) => {
  
  // Helpers para WebRTC Callbacks que actualizan Zustand
  const getWebRTCCallbacks = (): webrtcManager.WebRTCCallbacks => ({
    onSendSignal: (para, data) => {
      wsManager.enviarMensaje({
        tipo: 'webrtc-signal',
        para,
        data
      });
    },
    onP2PConnectionOpened: (targetUserId) => {
      const conn = webrtcManager.obtenerP2PConnections().get(targetUserId);
      if (!conn) return;

      set((state) => {
        const yaExisteHilo = state.p2pThreads.some(t => t.id === targetUserId);
        const nuevosHilos = yaExisteHilo 
          ? state.p2pThreads.map(t => t.id === targetUserId ? { ...t, isOnline: true } : t)
          : [...state.p2pThreads, {
              id: targetUserId,
              name: conn.displayName,
              avatar: '',
              isOnline: true,
              lastMessage: 'Conexión WebRTC establecida',
              timeAgo: 'Ahora',
              unreadCount: 0
            }];

        return {
          p2pConnectionStatus: { ...state.p2pConnectionStatus, [targetUserId]: 'connected' },
          p2pThreads: nuevosHilos
        };
      });

      if (get().activeP2PUserId === targetUserId) {
        webrtcManager.marcarVistoP2P(targetUserId);
      }
    },
    onP2PConnectionClosed: (targetUserId, displayName, motivo) => {
      set((state) => {
        const nuevosHilos = state.p2pThreads.map(t => t.id === targetUserId ? { ...t, isOnline: false, lastMessage: motivo } : t);
        return {
          p2pConnectionStatus: { ...state.p2pConnectionStatus, [targetUserId]: 'disconnected' },
          p2pThreads: nuevosHilos
        };
      });
      get().addNotification('warning', `${displayName}: ${motivo}`);
    },
    onP2PStatusChanged: (targetUserId, status, typing) => {
      set((state) => ({
        p2pConnectionStatus: { ...state.p2pConnectionStatus, [targetUserId]: status },
        p2pTypingStatus: { ...state.p2pTypingStatus, [targetUserId]: !!typing }
      }));
    },
    onP2PMessageReceived: (deUserId, displayName, texto, time, clase) => {
      const msg: Message = {
        id: String(Math.random()),
        senderId: deUserId,
        senderName: displayName,
        text: texto,
        timestamp: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSentByMe: clase === 'me'
      };

      set((state) => {
        const historialActual = state.p2pMessages[deUserId] || [];
        const nuevosMensajes = [...historialActual, msg];
        
        const nuevosHilos = state.p2pThreads.map(t => {
          if (t.id === deUserId) {
            return {
              ...t,
              lastMessage: texto,
              timeAgo: 'Ahora',
              unreadCount: state.activeP2PUserId === deUserId ? 0 : t.unreadCount + 1
            };
          }
          return t;
        });

        return {
          p2pMessages: { ...state.p2pMessages, [deUserId]: nuevosMensajes },
          p2pThreads: nuevosHilos
        };
      });
    },
    onP2PUnreadIncremented: (deUserId) => {
      set((state) => ({
        p2pThreads: state.p2pThreads.map(t => t.id === deUserId ? { ...t, unreadCount: t.unreadCount + 1 } : t)
      }));
    },
    onP2PMessageSeen: (deUserId) => {
      set((state) => {
        const mensajes = state.p2pMessages[deUserId] || [];
        if (mensajes.length > 0) {
          const nuevosMensajes = mensajes.map(m => 
            m.isSentByMe ? { ...m, status: 'read' as const } : m
          );
          return {
            p2pMessages: { ...state.p2pMessages, [deUserId]: nuevosMensajes }
          };
        }
        return {};
      });
    },
    onShowInvitation: (deUserId, deNombre, senal) => {
      get().addNotification('invitation', `${deNombre} quiere iniciar un chat privado P2P.`, { deUserId, senal });
    },
    onMediaCallReceived: (deUserId, deNombre, tipo) => {
      set({ mediaCallState: 'ringing', mediaCallType: tipo, mediaCallTargetUserId: deUserId });
    },
    onMediaCallAccepted: (deUserId) => {
      set({ mediaCallState: 'connected' });
    },
    onMediaCallRejected: (deUserId) => {
      set({ mediaCallState: 'idle', mediaCallType: null, mediaCallTargetUserId: null });
      const conn = webrtcManager.obtenerP2PConnections().get(deUserId);
      get().addNotification('info', `${conn?.displayName || 'El usuario'} rechazó la llamada.`);
    },
    onMediaCallEnded: (deUserId, reason) => {
      set({ mediaCallState: 'idle', mediaCallType: null, mediaCallTargetUserId: null });
      if (reason !== 'user-hangup') {
        const conn = webrtcManager.obtenerP2PConnections().get(deUserId);
        get().addNotification('info', `Llamada finalizada con ${conn?.displayName || 'el usuario'}.`);
      }
    },
    onRemoteStreamAdded: () => {
      // no-op; the overlay reads streams directly from webrtcManager
    },
    onLocalStreamAdded: () => {
      // no-op
    },
    onP2PFileReceived: (deUserId, displayName, fileData) => {
      const msg: Message = {
        id: fileData.fileId,
        senderId: deUserId,
        senderName: displayName,
        text: `📎 ${fileData.fileName}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSentByMe: false,
        fileUrl: fileData.fileUrl,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileType: fileData.fileType,
      };
      set((state) => {
        const historialActual = state.p2pMessages[deUserId] || [];
        const nuevosHilos = state.p2pThreads.map(t => {
          if (t.id === deUserId) {
            return {
              ...t,
              lastMessage: `📎 ${fileData.fileName}`,
              timeAgo: 'Ahora',
              unreadCount: state.activeP2PUserId === deUserId ? 0 : t.unreadCount + 1
            };
          }
          return t;
        });
        const { [deUserId]: _, ...restoReceivingProgress } = state.fileReceivingProgress;
        return {
          p2pMessages: { ...state.p2pMessages, [deUserId]: [...historialActual, msg] },
          p2pThreads: nuevosHilos,
          fileReceivingProgress: restoReceivingProgress,
        };
      });
    },
    onFileProgress: (targetUserId, fileId, sent, total) => {
      set((state) => ({
        fileTransferProgress: {
          ...state.fileTransferProgress,
          [targetUserId]: { fileId, sent, total, fileName: state.fileTransferProgress[targetUserId]?.fileName || '' },
        },
      }));
      if (sent === total) {
        setTimeout(() => {
          set((state) => {
            const { [targetUserId]: _, ...resto } = state.fileTransferProgress;
            return { fileTransferProgress: resto };
          });
        }, 1000);
      }
    },
  });

  // Procesador central de mensajes del WebSocket
  const procesarMensajeServidor = (data: any) => {
    if (!data.tipo) return;

    switch (data.tipo) {
      case 'auth-info':
        set((state) => {
          const userId = data.userId;
          const lastOffsets = userId ? cargarLastOffsets(userId) : {};
          return {
            currentUser: {
              id: userId,
              displayName: data.displayName,
              role: data.role
            },
            currentScreen: state.currentScreen === 'auth' ? 'lista-salas' : state.currentScreen,
            lastOffsets
          };
        });
        break;

      case 'join-success':
        set((state) => {
          const roomCode = data.sala.toLowerCase().replace(/\s+/g, '-');
          const antiguaSalaCode = state.currentRoomCode;
          const nuevasSalas = state.rooms.map(r => {
            if (r.id === antiguaSalaCode) {
              return { ...r, onlineCount: Math.max(0, r.onlineCount - 1) };
            }
            return r;
          });
          return {
            currentRoomCode: roomCode,
            rooms: nuevasSalas,
            roomMessages: [],
            typingUsers: []
          };
        });
        // Solicitar catch-up de mensajes perdidos al unirse a la sala
        {
          const roomCode = data.sala.toLowerCase().replace(/\s+/g, '-');
          const lastOffset = get().lastOffsets[roomCode];
          wsManager.enviarMensaje({
            tipo: 'catch-up',
            sala: data.sala,
            lastOffset: lastOffset || undefined,
          });
        }
        break;

      case 'token_refresh_ok':
        if (get().currentUser) {
          set({
            currentUser: {
              ...get().currentUser!,
              role: data.role,
              displayName: data.displayName
            }
          });
        }
        break;

      case 'ice-config':
        webrtcManager.actualizarIceServers(data.config);
        break;

      case 'salas-disponibles':
        const roomsMapeadas: Room[] = data.salas.map((salaNombre: string) => {
          const code = salaNombre.toLowerCase().replace(/\s+/g, '-');
          const meta = generarRoomMeta(salaNombre);
          return {
            id: code,
            name: salaNombre,
            icon: meta.icon,
            description: meta.description,
            onlineCount: 0,
            code
          };
        });
        set({ rooms: roomsMapeadas });
        break;

      case 'lista-usuarios':
        const list: RoomUser[] = data.usuarios;
        const salaCode = data.sala?.toLowerCase().replace(/\s+/g, '-');
        set((state) => ({
          roomUsers: list,
          rooms: state.rooms.map(r =>
            r.id === salaCode ? { ...r, onlineCount: list.length } : r
          )
        }));
        break;

      case 'user-typing':
        set((state) => {
          const sets = new Set(state.typingUsers);
          if (data.escribiendo) {
            sets.add(data.usuario);
          } else {
            sets.delete(data.usuario);
          }
          return { typingUsers: Array.from(sets) };
        });
        break;

      case 'webrtc-signal':
        webrtcManager.manejarSenalWebRTC(data.de, data.deNombre, data.data, getWebRTCCallbacks());
        break;

      case 'peer-offline':
        {
          // Un peer se desconectó del WS — la conexión P2P probablemente caerá pronto
          const connP2P = webrtcManager.obtenerP2PConnections().get(data.userId);
          if (connP2P) {
            set((state) => ({
              p2pConnectionStatus: { ...state.p2pConnectionStatus, [data.userId]: 'reconnecting' },
              p2pThreads: state.p2pThreads.map(t =>
                t.id === data.userId
                  ? { ...t, lastMessage: `${data.displayName || 'El usuario'} se ha desconectado. Reconectando...` }
                  : t
              )
            }));
          }
        }
        break;

      case 'kicked':
        get().addNotification('error', `Fuiste expulsado por el moderador ${data.payload.por}. Motivo: ${data.payload.motivo}`, null, 10000);
        get().logout();
        break;

      case 'muted':
        const duracion = data.payload.duracion;
        set({ isMuted: true, muteDurationRemaining: duracion });
        get().addNotification('warning', `Fuiste silenciado por ${duracion}s por ${data.payload.por}.`);
        
        const interval = setInterval(() => {
          set((state) => {
            const restante = state.muteDurationRemaining - 1;
            if (restante <= 0) {
              clearInterval(interval);
              return { isMuted: false, muteDurationRemaining: 0 };
            }
            return { muteDurationRemaining: restante };
          });
        }, 1000);
        break;

      case 'rol_actualizado':
        if (get().currentUser) {
          set({
            currentUser: {
              ...get().currentUser!,
              role: data.payload.nuevoRol
            }
          });
        }
        get().addNotification('info', `Tu rol ha sido actualizado a: ${data.payload.nuevoRol}`);
        break;

      case 'chat-history':
        {
          const historyMsgs: Message[] = (data.mensajes || []).map((m: any) => ({
            id: `hist-${m.offset}`,
            senderId: m.userId || 'system',
            senderName: m.usuario || 'Sistema',
            text: m.mensaje || '',
            timestamp: new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSentByMe: m.userId === get().currentUser?.id
          }));
          set((state) => {
            const nuevosOffsets = { ...state.lastOffsets };
            if (data.mensajes && data.mensajes.length > 0) {
              const ultimo = data.mensajes[data.mensajes.length - 1];
              nuevosOffsets[get().currentRoomCode] = ultimo.offset;
            }
            if (get().currentUser) {
              guardarLastOffsets(get().currentUser!.id, nuevosOffsets);
            }
            return {
              roomMessages: [...state.roomMessages, ...historyMsgs],
              lastOffsets: nuevosOffsets
            };
          });
        }
        break;

      default:
        // Errores del servidor como toast, no como mensaje de chat
        if (data.tipo === 'error') {
          get().addNotification('error', data.mensaje || 'Error del servidor');
          break;
        }
        // Mensaje ordinario de chat o sistema
        if (data.mensaje || data.tipo === 'sistema') {
          const msgObj: Message = {
            id: data.id || String(Math.random()),
            senderId: data.tipo === 'sistema' ? 'system' : (data.userId || 'anon'),
            senderName: data.usuario || 'Sistema',
            text: data.mensaje || '',
            timestamp: new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSentByMe: data.userId === get().currentUser?.id
          };
          set((state) => {
            const nuevosOffsets = data.offset
              ? { ...state.lastOffsets, [state.currentRoomCode]: data.offset }
              : state.lastOffsets;
            if (data.offset && get().currentUser) {
              guardarLastOffsets(get().currentUser!.id, nuevosOffsets);
            }
            return {
              roomMessages: [...state.roomMessages, msgObj],
              lastOffsets: nuevosOffsets
            };
          });
        }
        break;
    }
  };

  return {
    // Valores Iniciales
    currentScreen: 'auth',
    transitionDirection: 'none',
    session: null,
    wsInitializing: false,
    currentUser: null,
    wsStatus: 'disconnected',
    rooms: [],
    currentRoomCode: '',
    roomMessages: [],
    roomUsers: [],
    typingUsers: [],
    
    p2pThreads: [],
    p2pMessages: {},
    activeP2PUserId: null,
    p2pConnectionStatus: {},
    p2pTypingStatus: {},
    previousP2PConnections: {},
    
    mediaCallState: 'idle',
    mediaCallType: null,
    mediaCallTargetUserId: null,

    fileTransferProgress: {},
    fileReceivingProgress: {},

    isMuted: false,
    muteDurationRemaining: 0,
    isEditingProfile: false,
    
    lastOffsets: {},
    
    notifications: [],

    // Inicializar app
    inicializarChat: async () => {
      // Guard: evita doble inicialización (ej. doble useEffect en dev)
      if (get().wsInitializing || get().wsStatus !== 'disconnected') {
        console.warn('[Store] inicializarChat ignorada — ya hay una conexión en curso.');
        return;
      }

      try {
        set({ wsInitializing: true });
        const session = await obtenerSesion();
        if (session) {
          set({ session });
          await get().conectarWS();
        } else {
          const current = get().currentScreen;
          const esPaginaPublica = current === 'reset-password' || current === 'confirm-email';
          set({ currentScreen: esPaginaPublica ? current : 'auth', wsInitializing: false });
        }
      } catch (e) {
        console.error('Error al inicializar store:', e);
        const current = get().currentScreen;
        const esPaginaPublica = current === 'reset-password' || current === 'confirm-email';
        set({ currentScreen: esPaginaPublica ? current : 'auth', wsInitializing: false });
      }

      // Escuchar cambios de autenticación
      onCambioEstadoAuth((event, session) => {
        const socketState = wsManager.obtenerEstadoSocket();
        
        if (event === 'TOKEN_REFRESHED' && session) {
          wsManager.setToken(session.access_token);
          if (socketState === WebSocket.OPEN) {
            wsManager.enviarMensaje({
              tipo: 'token_refresh',
              token: session.access_token
            });
          }
        }
        if (event === 'SIGNED_OUT') {
          get().logout();
        }
      });
    },

    // Conectar WebSocket
    conectarWS: async () => {
      const token = await obtenerToken();
      if (!token) {
        const current = get().currentScreen;
        const esPaginaPublica = current === 'reset-password' || current === 'confirm-email';
        set({ currentScreen: esPaginaPublica ? current : 'auth' });
        return;
      }

      set({ wsStatus: 'connecting' });

      wsManager.conectar(token, {
        onOpen: () => {
          set({ wsStatus: 'connected', wsInitializing: false });
          if (get().currentUser && get().currentRoomCode) {
            get().joinRoom(get().currentRoomCode);
          }

          // Restaurar conexiones P2P que estaban activas antes de la desconexión WS
          const prevConnections = get().previousP2PConnections;
          if (prevConnections && Object.keys(prevConnections).length > 0) {
            for (const [targetUserId, displayName] of Object.entries(prevConnections)) {
              webrtcManager.iniciarConexionP2P(targetUserId, displayName, getWebRTCCallbacks());
            }
            set({ previousP2PConnections: {} });
          }
        },
        onClose: (event) => {
          // Para códigos fatales (4001, 4002, 4003) → destruir todo sin guardar
          if (event.code === 4001 || event.code === 4002 || event.code === 4003) {
            webrtcManager.cerrarTodasLasConexionesP2P(getWebRTCCallbacks(), true);
            webrtcManager.cancelarTodasLasReconexiones();
            set({ wsStatus: 'disconnected', wsInitializing: false, previousP2PConnections: {} });
          } else {
            // Para otros códigos → guardar conexiones y marcar como reconectando
            const p2pConns = webrtcManager.obtenerP2PConnections();
            const previousConnections: Record<string, string> = {};
            p2pConns.forEach((conn, userId) => {
              previousConnections[userId] = conn.displayName;
            });
            webrtcManager.marcarTodasComoReconnecting(getWebRTCCallbacks());
            set({ wsStatus: 'disconnected', wsInitializing: false, previousP2PConnections: previousConnections });
          }

          if (event.code === 4001) {
            get().addNotification('error', 'Sesión expirada o token inválido.');
            get().logout();
            return;
          }
          if (event.code === 4002) {
            // El servidor cerró porque hay otra sesión activa en otra pestaña.
            // NO volvemos a conectar automáticamente — esperamos acción del usuario.
            get().addNotification('error', 'Tu sesión se cerró porque se abrió otra ventana del chat.');
            // Cerrar sesión de Supabase también para evitar reconexión automática
            get().logout();
            return;
          }
          if (event.code === 4003) {
            get().addNotification('error', 'Has sido expulsado del chat por un moderador.');
            get().logout();
            return;
          }
        },
        onReconnectionFailed: () => {
          get().addNotification('error', 'No se pudo restablecer la conexión con el servidor de chat.');
          const current = get().currentScreen;
          const esPaginaPublica = current === 'reset-password' || current === 'confirm-email';
          set({ currentScreen: esPaginaPublica ? current : 'auth' });
        },
        onMessage: (data) => {
          procesarMensajeServidor(data);
        }
      });
    },

    // Navegar entre pantallas
    navigateTo: (screen, direction = 'none') => {
      set({ currentScreen: screen, transitionDirection: direction });
    },

    // Autenticación
    login: async (email, password) => {
      const { data, error } = await iniciarSesion(email, password);
      if (error) {
        return { success: false, error: error.message };
      }
      set({ session: data.session });
      await get().conectarWS();
      return { success: true };
    },

    register: async (displayName, email, password) => {
      const { data, error } = await registrarUsuario(email, password, displayName);
      if (error) {
        return { success: false, error: error.message };
      }
      if (data.session) {
        set({ session: data.session });
        await get().conectarWS();
      }
      return { success: true };
    },

    logout: async () => {
      const currentUserId = get().currentUser?.id;
      if (!get().session && !currentUserId) return;

      // Revocar ObjectURLs de archivos P2P antes de limpiar
      for (const msgs of Object.values(get().p2pMessages)) {
        revocarUrlsArchivos(msgs);
      }

      set({
        session: null,
        currentUser: null,
        wsStatus: 'disconnected',
        currentScreen: 'auth',
        roomMessages: [],
        roomUsers: [],
        p2pThreads: [],
        p2pMessages: {},
        activeP2PUserId: null,
        isMuted: false,
        muteDurationRemaining: 0,
        lastOffsets: {}
      });

      wsManager.cerrarConexion();
      webrtcManager.cancelarTodasLasReconexiones();
      webrtcManager.cerrarTodasLasConexionesP2P(getWebRTCCallbacks(), true);
      
      try {
        await cerrarSesion();
      } catch (err) {
        console.error('Error al cerrar sesión:', err);
      }
    },

    // --- Auth Extensions ---
    updateProfile: async (displayName) => {
      const { error } = await actualizarPerfil(displayName);
      if (error) return { success: false, error: error.message };
      
      // Refrescar usuario y actualizar store
      const { data: userData } = await obtenerUsuario();
      if (userData?.user) {
        set((state) => ({
          currentUser: state.currentUser ? {
            ...state.currentUser,
            displayName: userData.user.user_metadata?.display_name || displayName
          } : null
        }));
      }
      get().addNotification('success', 'Perfil actualizado correctamente');
      return { success: true };
    },

    changePassword: async (currentPassword, newPassword) => {
      // Re-autenticar para validar contraseña actual
      const email = get().session?.user?.email;
      if (!email) return { success: false, error: 'No hay sesión activa' };
      
      const { error: reauthError } = await supabaseClient.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (reauthError) return { success: false, error: 'Contraseña actual incorrecta' };
      
      const { error } = await cambiarContrasena(newPassword);
      if (error) return { success: false, error: error.message };
      
      get().addNotification('success', 'Contraseña cambiada correctamente');
      return { success: true };
    },

    requestPasswordReset: async (email) => {
      const { error } = await recuperarContrasena(email);
      if (error) return { success: false, error: error.message };
      get().addNotification('info', 'Si el email existe, recibirás instrucciones para restablecer la contraseña');
      return { success: true };
    },

    resendEmailConfirmation: async (email) => {
      const { error } = await reenviarConfirmacionEmail(email);
      if (error) return { success: false, error: error.message };
      get().addNotification('info', 'Email de confirmación reenviado. Revisa tu bandeja de entrada.');
      return { success: true };
    },

    setEditingProfile: (editing) => {
      set({ isEditingProfile: editing });
    },

    // Acciones de Salas / Mensajes Públicos
    joinRoom: (roomCodeOrName) => {
      // Buscar la sala en la lista del store para usar su nombre original con mayúsculas/acentos
      const room = get().rooms.find(
        (r) => r.id === roomCodeOrName || r.name.toLowerCase() === roomCodeOrName.toLowerCase()
      );
      const roomName = room ? room.name : roomCodeOrName;

      wsManager.enviarMensaje({
        tipo: 'join',
        sala: roomName,
        requestId: crypto.randomUUID(),
      });
    },

    sendRoomMessage: (text) => {
      if (get().isMuted) return;
      const userId = get().currentUser?.id;
      if (!userId) return;
      const clientOffset = wsManager.generarClientOffset(userId);
      wsManager.enviarConAck({
        tipo: 'chat',
        mensaje: text,
        clientOffset
      }, 10000).catch((err) => {
        console.warn('[Chat] Mensaje no confirmado por el servidor, encolado para reintento:', err);
      });
    },

    sendPublicTyping: (escribiendo) => {
      wsManager.enviarMensaje({
        tipo: 'typing',
        escribiendo
      });
    },

    startP2PChat: async (targetUserId, displayName) => {
      if (targetUserId === get().currentUser?.id) {
        console.warn('No puedes iniciar un chat P2P contigo mismo.');
        return;
      }

      const activeUser = webrtcManager.obtenerUsuarioP2PActivo();
      if (activeUser !== targetUserId) {
        const p2pConns = webrtcManager.obtenerP2PConnections();
        if (!p2pConns.has(targetUserId)) {
          await webrtcManager.iniciarConexionP2P(targetUserId, displayName, getWebRTCCallbacks());
        }
        
        webrtcManager.establecerUsuarioP2PActivo(targetUserId);
        
        set((state) => {
          // Reconstruir mensajes desde webrtcManager (sin metadata de archivos)
          const conn = webrtcManager.obtenerP2PConnections().get(targetUserId);
          const msgsFromWM = conn ? conn.messages.map(m => ({
          id: crypto.randomUUID(),
            senderId: m.de === 'Tú' ? 'me' : targetUserId,
            senderName: m.de,
            text: m.texto,
            timestamp: m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSentByMe: m.de === 'Tú'
          })) : [];

          // Preservar mensajes existentes del store (tienen fileUrl/fileType/fileName)
          const existingMsgs = state.p2pMessages[targetUserId] || [];
          
          // Fusionar: partir de los mensajes existentes del store y agregar solo los que faltan
          // Un mensaje "falta" si no hay otro con el mismo texto + timestamp en el store
          const existingKeys = new Set(
            existingMsgs.map(m => `${m.text}||${m.timestamp}`)
          );
          const newMsgs = msgsFromWM.filter(m => !existingKeys.has(`${m.text}||${m.timestamp}`));
          
          const mergedMsgs = [...existingMsgs, ...newMsgs];

          // Limpiar badge unread y asegurar que el hilo esté creado
          const yaExisteHilo = state.p2pThreads.some(t => t.id === targetUserId);
          const nuevosHilos = yaExisteHilo 
            ? state.p2pThreads.map(t => t.id === targetUserId ? { ...t, unreadCount: 0 } : t)
            : [...state.p2pThreads, {
                id: targetUserId,
                name: displayName,
                avatar: '',
                isOnline: false,
                lastMessage: 'Conectando...',
                timeAgo: 'Ahora',
                unreadCount: 0
              }];

          return {
            activeP2PUserId: targetUserId,
            p2pMessages: { ...state.p2pMessages, [targetUserId]: mergedMsgs },
            p2pThreads: nuevosHilos
          };
        });
        
        webrtcManager.marcarVistoP2P(targetUserId);
      }
    },

    sendP2PMessage: (targetUserId, text) => {
      const msg = webrtcManager.enviarMensajeChatP2P(targetUserId, text);
      if (msg) {
        const msgObj: Message = {
          id: crypto.randomUUID(),
          senderId: 'me',
          senderName: 'Tú',
          text,
          timestamp: msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSentByMe: true
        };
        set((state) => {
          const historial = state.p2pMessages[targetUserId] || [];
          
          // Actualizar hilo de vista previa
          const nuevosHilos = state.p2pThreads.map(t => 
            t.id === targetUserId ? { ...t, lastMessage: `Tú: ${text}`, timeAgo: 'Ahora' } : t
          );

          return {
            p2pMessages: { ...state.p2pMessages, [targetUserId]: [...historial, msgObj] },
            p2pThreads: nuevosHilos
          };
        });
      }
    },

    sendP2PTyping: (targetUserId, escribiendo) => {
      webrtcManager.notificarEscrituraP2P(targetUserId, escribiendo);
    },

    acceptP2PInvitation: async (deUserId, senal) => {
      await webrtcManager.aceptarInvitacionP2P(deUserId, senal, getWebRTCCallbacks());
      const conn = webrtcManager.obtenerP2PConnections().get(deUserId);
      if (conn) {
        webrtcManager.establecerUsuarioP2PActivo(deUserId);
        
        set((state) => {
          const yaExiste = state.p2pThreads.some(t => t.id === deUserId);
          const nuevosHilos = yaExiste 
            ? state.p2pThreads.map(t => t.id === deUserId ? { ...t, isOnline: false } : t)
            : [...state.p2pThreads, {
                id: deUserId,
                name: conn.displayName,
                avatar: '',
                isOnline: false,
                lastMessage: 'Conectando...',
                timeAgo: 'Ahora',
                unreadCount: 0
              }];
          return {
            activeP2PUserId: deUserId,
            p2pThreads: nuevosHilos
          };
        });
        
        webrtcManager.marcarVistoP2P(deUserId);
        get().navigateTo('chat-privado', 'push');
      }
    },

    rejectP2PInvitation: (deUserId) => {
      webrtcManager.cancelarReconexionesP2P(deUserId);
      webrtcManager.cerrarConexionP2P(deUserId, 'Invitación rechazada', getWebRTCCallbacks(), true);
    },

    closeP2PChat: (targetUserId) => {
      webrtcManager.establecerUsuarioP2PActivo(null);
      set({ activeP2PUserId: null });
    },

    terminarP2PChat: (targetUserId) => {
      if (get().mediaCallTargetUserId === targetUserId) {
        webrtcManager.finalizarLlamadaMedia(getWebRTCCallbacks());
        set({ mediaCallState: 'idle', mediaCallType: null, mediaCallTargetUserId: null });
      }
      webrtcManager.cancelarReconexionesP2P(targetUserId);
      webrtcManager.cerrarConexionP2P(targetUserId, 'Chat finalizado', getWebRTCCallbacks(), true);

      set((state) => {
        revocarUrlsArchivos(state.p2pMessages[targetUserId] || []);
        const { [targetUserId]: _msgs, ...restoMensajes } = state.p2pMessages;
        const { [targetUserId]: _conn, ...restoEstados } = state.p2pConnectionStatus;
        const { [targetUserId]: _typ, ...restoEscribiendo } = state.p2pTypingStatus;
        return {
          activeP2PUserId: null,
          p2pThreads: state.p2pThreads.filter(t => t.id !== targetUserId),
          p2pMessages: restoMensajes,
          p2pConnectionStatus: restoEstados,
          p2pTypingStatus: restoEscribiendo,
        };
      });

      get().navigateTo('mensajes-privados', 'push_back');
    },

    reconnectP2P: async (targetUserId) => {
      // Si ya hay una conexión activa, no hacer nada
      const existing = webrtcManager.obtenerP2PConnections().get(targetUserId);
      if (existing && existing.pc.connectionState === 'connected') return;

      // Cerrar conexión existente si la hay (está en estado roto)
      if (existing) {
        webrtcManager.cancelarReconexionesP2P(targetUserId);
        webrtcManager.cerrarConexionP2P(targetUserId, 'Reconectando...', getWebRTCCallbacks(), true);
      }

      // Obtener displayName del thread
      const thread = get().p2pThreads.find(t => t.id === targetUserId);
      const displayName = thread?.name || 'Usuario';

      set((state) => ({
        activeP2PUserId: targetUserId,
        p2pConnectionStatus: { ...state.p2pConnectionStatus, [targetUserId]: 'connecting' },
        p2pThreads: state.p2pThreads.map(t =>
          t.id === targetUserId
            ? { ...t, isOnline: false, lastMessage: 'Reconectando...' }
            : t
        )
      }));

      webrtcManager.establecerUsuarioP2PActivo(targetUserId);
      await webrtcManager.iniciarConexionP2P(targetUserId, displayName, getWebRTCCallbacks());
    },

    iniciarLlamadaMedia: async (targetUserId, tipo) => {
      if (webrtcManager.estaEnLlamada()) {
        get().addNotification('warning', 'Ya hay una llamada en curso.');
        return;
      }
      set({ mediaCallState: 'calling', mediaCallType: tipo, mediaCallTargetUserId: targetUserId });
      await webrtcManager.iniciarLlamadaMedia(targetUserId, tipo, getWebRTCCallbacks());
    },

    aceptarLlamadaMedia: async () => {
      const targetUserId = get().mediaCallTargetUserId;
      if (!targetUserId) return;
      await webrtcManager.aceptarLlamadaMedia(targetUserId, getWebRTCCallbacks());
      set({ mediaCallState: 'connected' });
    },

    rechazarLlamadaMedia: () => {
      const targetUserId = get().mediaCallTargetUserId;
      if (!targetUserId) return;
      webrtcManager.rechazarLlamadaMedia(targetUserId, getWebRTCCallbacks());
      set({ mediaCallState: 'idle', mediaCallType: null, mediaCallTargetUserId: null });
    },

    finalizarLlamadaMedia: () => {
      webrtcManager.finalizarLlamadaMedia(getWebRTCCallbacks());
      set({ mediaCallState: 'idle', mediaCallType: null, mediaCallTargetUserId: null });
    },

    alternarMicrofono: (activo) => {
      webrtcManager.alternarMicrofono(activo);
    },

    alternarCamara: (activo) => {
      webrtcManager.alternarCamara(activo);
    },

    sendP2PFile: async (targetUserId, file) => {
      if (!webrtcManager.esTipoArchivoPermitido(file.type)) {
        get().addNotification('error', 'Tipo de archivo no permitido.');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        get().addNotification('error', 'El archivo excede el límite de 50MB.');
        return;
      }

      const fileId = crypto.randomUUID();

      set((state) => ({
        fileTransferProgress: {
          ...state.fileTransferProgress,
          [targetUserId]: { fileId, sent: 0, total: 1, fileName: file.name },
        },
      }));

      const msg: Message = {
        id: fileId,
        senderId: 'me',
        senderName: 'Tú',
        text: `📎 ${file.name}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSentByMe: true,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };

      if (file.type.startsWith('image/')) {
        msg.fileUrl = URL.createObjectURL(file);
      }

      set((state) => {
        const historial = state.p2pMessages[targetUserId] || [];
        const nuevosHilos = state.p2pThreads.map(t =>
          t.id === targetUserId ? { ...t, lastMessage: `📎 ${file.name}`, timeAgo: 'Ahora' } : t
        );
        return {
          p2pMessages: { ...state.p2pMessages, [targetUserId]: [...historial, msg] },
          p2pThreads: nuevosHilos,
        };
      });

      const success = await webrtcManager.enviarArchivoP2P(targetUserId, file, getWebRTCCallbacks(), fileId);
      if (!success) {
        get().addNotification('error', `Error al enviar ${file.name}.`);
      }
    },

    cancelarTransferenciaP2P: (targetUserId, fileId) => {
      webrtcManager.cancelarTransferencia(targetUserId, fileId);
      set((state) => {
        const { [targetUserId]: _, ...resto } = state.fileTransferProgress;
        return { fileTransferProgress: resto };
      });
    },

    marcarVistoP2P: (targetUserId) => {
      webrtcManager.marcarVistoP2P(targetUserId);
      set((state) => ({
        p2pThreads: state.p2pThreads.map(t => t.id === targetUserId ? { ...t, unreadCount: 0 } : t)
      }));
    },

    // Moderación
    kickUser: (userId, motivo) => {
      wsManager.enviarMensaje({
        tipo: 'kick_user',
        payload: { userId, motivo }
      });
    },

    muteUser: (userId, duracion) => {
      wsManager.enviarMensaje({
        tipo: 'mute_user',
        payload: { userId, duracion }
      });
    },

    changeUserRole: (userId, nuevoRol) => {
      wsManager.enviarMensaje({
        tipo: 'cambiar_rol',
        payload: { userId, nuevoRol }
      });
    },

    // Notificaciones Toast
    addNotification: (tipo, mensaje, metadata = null, duracion = 8000) => {
      const id = String(Math.random());
      set((state) => ({
        notifications: [...state.notifications, { id, tipo, mensaje, metadata }]
      }));

      if (tipo !== 'invitation' && tipo !== 'call') {
        setTimeout(() => {
          get().removeNotification(id);
        }, duracion);
      }
    },

    removeNotification: (id) => {
      set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }));
    }
  };
});
