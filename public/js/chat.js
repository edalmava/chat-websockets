let socket = null;
let reintentosConexion = 0;
const MAX_REINTENTOS = 5;
let reconexionTimeout = null;

// Elementos del DOM
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginRoomSelect = document.getElementById('loginRoomSelect');
const joinButton = document.getElementById('joinButton');
const userIdentity = document.getElementById('user-identity');
const currentUsernameSpan = document.getElementById('current-username');
const sendButton = document.getElementById('sendButton');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('users');
const roomListItems = document.querySelectorAll('#rooms li');
const typingIndicator = document.getElementById('typing-indicator');

// Elementos P2P
const p2pModal = document.getElementById('p2p-modal');
const p2pTargetNameSpan = document.getElementById('p2p-target-name');
const p2pStatusSpan = document.getElementById('p2p-status');
const p2pMessagesContainer = document.getElementById('p2p-messages');
const p2pMessageInput = document.getElementById('p2pMessageInput');
const p2pSendButton = document.getElementById('p2pSendButton');
const closeP2PButton = document.getElementById('closeP2P');
const p2pActiveList = document.getElementById('p2p-active-list');
const p2pListSection = document.getElementById('p2p-list-section');
const notificationsContainer = document.getElementById('notifications-container');

const statusBanner = document.createElement('div');
statusBanner.id = 'connection-status';
statusBanner.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;display:none;';
document.body.appendChild(statusBanner);

let miNombreUsuario = '';
let salaActual = '';
let estaEscribiendo = false;
let typingTimeout = null;
const usuariosEscribiendo = new Set();

// GESTOR P2P MULTI-CHAT
const p2pManager = new Map(); // Clave: usuario, Valor: { pc, dc, messages: [], unread: 0, status: '', typing: false }
let activeP2PUser = null;
let p2pEstaEscribiendo = false;
let p2pTypingTimeout = null;

const iceServers = {
    iceServers: [
        { urls: 'stun:stun.colsaba.site:3478' },
        { 
            urls: [
                'turn:turn.colsaba.site:3478?transport=udp',
                'turn:turn.colsaba.site:3478?transport=tcp'
            ],
            username: 'edwin',
            credential: 'edwin2026'
        }
    ],
    iceCandidatePoolSize: 10
};

function obtenerUrlServer() {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev ? 'ws://localhost:8443' : 'wss://chat.colsaba.site';
}

function actualizarStatusUI(mensaje, tipo = 'info') {
    statusBanner.textContent = mensaje;
    statusBanner.style.display = 'block';
    statusBanner.style.backgroundColor = tipo === 'success' ? '#dcfce7' : (tipo === 'error' ? '#fee2e2' : '#dbeafe');
    if (tipo === 'success') setTimeout(() => statusBanner.style.display = 'none', 3000);
}

function conectar() {
    const url = obtenerUrlServer();
    if (socket) socket.close();
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
        actualizarStatusUI('Conectado', 'success');
        reintentosConexion = 0;
        if (miNombreUsuario) joinChat(true);
    });
    socket.addEventListener('close', () => {
        // Cerrar todas las conexiones P2P activas — el servidor ya no puede señalizar
        p2pManager.forEach((conn, usuario) => {
            cerrarConexionP2P(usuario, 'Desconectado del servidor');
        });

        if (reintentosConexion < MAX_REINTENTOS) {
            reintentosConexion++;
            reconexionTimeout = setTimeout(conectar, 1000 * Math.pow(2, reintentosConexion));
        }
    });
    socket.addEventListener('message', manejarMensaje);
}
conectar();

function sanitizeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const colorPalette = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#d97706', '#db2777', '#059669', '#1f2937'];
const userColors = {};
let colorIndex = 0;

function getUserColor(username) {
    if (!userColors[username]) {
        userColors[username] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
    }
    return userColors[username];
}

function joinChat(esReconexion = false) {
    const username = miNombreUsuario || loginUsernameInput.value.trim();
    const room = salaActual || loginRoomSelect.value;
    if (!username) return;
    socket.send(JSON.stringify({ tipo: 'join', usuario: username, sala: room }));
    miNombreUsuario = username;
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ tipo: 'chat', mensaje: message }));
    messageInput.value = '';
    
    // Resetear estado de escritura al enviar
    if (estaEscribiendo) {
        estaEscribiendo = false;
        socket.send(JSON.stringify({ tipo: 'typing', escribiendo: false }));
    }
}

// LISTENERS
joinButton.addEventListener('click', () => joinChat());
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());

// Emisor de "Está escribiendo..."
messageInput.addEventListener('input', () => {
    if (!estaEscribiendo && socket.readyState === WebSocket.OPEN) {
        estaEscribiendo = true;
        socket.send(JSON.stringify({ tipo: 'typing', escribiendo: true }));
    }

    // Debounce para dejar de escribir
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        if (estaEscribiendo && socket.readyState === WebSocket.OPEN) {
            estaEscribiendo = false;
            socket.send(JSON.stringify({ tipo: 'typing', escribiendo: false }));
        }
    }, 2000);
});

p2pSendButton.addEventListener('click', sendP2PMessage);
p2pMessageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendP2PMessage());

// Emisor de "Está escribiendo..." para P2P
p2pMessageInput.addEventListener('input', () => {
    if (!activeP2PUser) return;
    if (!p2pEstaEscribiendo) {
        p2pEstaEscribiendo = true;
        enviarPorDC(activeP2PUser, 'typing', { escribiendo: true });
    }

    clearTimeout(p2pTypingTimeout);
    p2pTypingTimeout = setTimeout(() => {
        if (p2pEstaEscribiendo) {
            p2pEstaEscribiendo = false;
            enviarPorDC(activeP2PUser, 'typing', { escribiendo: false });
        }
    }, 2000);
});

closeP2PButton.addEventListener('click', () => { p2pModal.classList.add('hidden'); activeP2PUser = null; });

function enviarPorDC(usuario, tipo, payload) {
    const conn = p2pManager.get(usuario);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
        const data = JSON.stringify({
            tipo,
            payload,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9)
        });
        conn.dc.send(data);
        return true;
    }
    return false;
}

function manejarMensaje(event) {
    const data = JSON.parse(event.data);
    
    // Validar que el mensaje tenga contenido o sea un tipo conocido antes de procesar
    if (!data.tipo) return;

    switch (data.tipo) {
        case 'join-success':
            salaActual = data.sala;
            loginContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            userIdentity.classList.remove('hidden');
            currentUsernameSpan.textContent = miNombreUsuario;
            break;
        case 'lista-usuarios':
            actualizarListaUsuarios(data.usuarios);
            break;
        case 'user-typing':
            if (data.escribiendo) {
                usuariosEscribiendo.add(data.usuario);
            } else {
                usuariosEscribiendo.delete(data.usuario);
            }
            actualizarIndicadorEscritura();
            break;
        case 'webrtc-signal':
            manejarSenalWebRTC(data.de, data.data);
            break;
        case 'chat':
        case 'sistema':
        case 'error':
            mostrarMensaje(data);
            break;
        default:
            // Ignorar otros tipos de mensajes internos para evitar bloques vacíos
            break;
    }
}

function actualizarIndicadorEscritura() {
    if (usuariosEscribiendo.size === 0) {
        typingIndicator.classList.add('hidden');
        typingIndicator.textContent = '';
    } else {
        const lista = Array.from(usuariosEscribiendo);
        let texto = '';
        if (lista.length === 1) {
            texto = `${lista[0]} está escribiendo...`;
        } else if (lista.length === 2) {
            texto = `${lista[0]} y ${lista[1]} están escribiendo...`;
        } else {
            texto = 'Varios usuarios están escribiendo...';
        }
        typingIndicator.textContent = texto;
        typingIndicator.classList.remove('hidden');
    }
}

function actualizarListaUsuarios(usuarios) {
    usersList.innerHTML = '';
    usuarios.forEach((usuario) => {
        if (usuario === miNombreUsuario) return;
        const li = document.createElement('li');
        li.textContent = usuario;
        li.style.borderLeftColor = getUserColor(usuario);
        li.onclick = () => abrirVentanaP2P(usuario);
        usersList.appendChild(li);
    });
}

// ============================================
// LÓGICA MULTI-P2P
// ============================================

// Añadir esta función nueva
function cerrarConexionP2P(usuario, motivo = 'Conexión cerrada') {
    const conn = p2pManager.get(usuario);
    if (!conn) return;

    // Cerrar DataChannel si está abierto
    if (conn.dc && conn.dc.readyState !== 'closed') {
        conn.dc.close();
    }

    // Cerrar RTCPeerConnection — libera ICE, DTLS y todos los recursos de red
    if (conn.pc && conn.pc.connectionState !== 'closed') {
        conn.pc.close();
    }

    // Si el modal estaba mostrando este chat, notificar y bloquearlo
    if (activeP2PUser === usuario) {
        const div = document.createElement('div');
        div.className = 'p2p-msg p2p-msg-them';
        div.innerHTML = `<div class="p2p-msg-text" style="color:var(--text-muted);font-style:italic">
            ⚠️ ${motivo}
        </div>`;
        p2pMessagesContainer.appendChild(div);
        p2pMessagesContainer.scrollTop = p2pMessagesContainer.scrollHeight;

        // Deshabilitar el input para que no se pueda escribir a un peer muerto
        p2pMessageInput.disabled = true;
        p2pMessageInput.placeholder = 'Conexión cerrada';
        p2pSendButton.disabled = true;
    }

    // Eliminar del manager y actualizar sidebar
    p2pManager.delete(usuario);
    actualizarSidebarP2P();
}

async function abrirVentanaP2P(usuario) {
    if (!p2pManager.has(usuario)) {
        await iniciarConexionP2P(usuario);
    }
    conmutarChatP2P(usuario);
}

async function iniciarConexionP2P(usuario) {
    console.log(`[WebRTC] Iniciando conexión con: ${usuario}`);
    const pc = new RTCPeerConnection(iceServers);
    const connection = { pc, dc: null, messages: [], unread: 0, status: 'Conectando...', candidateBuffer: [] };
    p2pManager.set(usuario, connection);
    
    configurarPC(usuario, pc);
    const dc = pc.createDataChannel('chat');
    connection.dc = dc;
    configurarDC(usuario, dc);

    try {
        const offer = await pc.createOffer();
        console.log(`[WebRTC] Oferta creada para ${usuario}`);
        await pc.setLocalDescription(offer);
        enviarSenal(usuario, { tipo: 'offer', sdp: offer });
        actualizarSidebarP2P();
    } catch (err) {
        console.error(`[WebRTC] Error creando oferta para ${usuario}:`, err);
    }
}

function configurarPC(usuario, pc) {
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            if (e.candidate.candidate.includes('relay')) {
                console.log(`[WebRTC] ✅ Candidato RELAY encontrado para ${usuario}. El servidor TURN está funcionando.`);
            }
            console.log(`[WebRTC] Nuevo candidato ICE para ${usuario}:`, e.candidate.candidate);
            enviarSenal(usuario, { tipo: 'candidate', candidate: e.candidate });
        } else {
            console.log(`[WebRTC] Fin de recolección de candidatos ICE para ${usuario}`);
            const hasRelay = pc.localDescription && pc.localDescription.sdp.includes('typ relay');
            if (!hasRelay) {
                console.warn(`[WebRTC] ⚠️ No se generaron candidatos RELAY para ${usuario}. Revisa la conexión al servidor TURN.`);
            }
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] Estado ICE con ${usuario}: ${pc.iceConnectionState}`);
    };

    pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC] Estado de recolección ICE: ${pc.iceGatheringState}`);
    };

    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Estado de conexión con ${usuario}: ${pc.connectionState}`);
        const conn = p2pManager.get(usuario);
        if (!conn) return;

        conn.status = pc.connectionState;
        if (activeP2PUser === usuario) actualizarP2PUI(usuario);

        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            const motivo = pc.connectionState === 'failed'
                ? 'La conexión falló (posible bloqueo de firewall/NAT)'
                : `${usuario} se ha desconectado`;
            console.warn(`[WebRTC] Conexión terminal con ${usuario}: ${pc.connectionState}`);
            cerrarConexionP2P(usuario, motivo);
        }
    };

    pc.ondatachannel = (e) => {
        console.log(`[WebRTC] Canal de datos recibido de ${usuario}`);
        const conn = p2pManager.get(usuario);
        if (conn) {
            conn.dc = e.channel;
            configurarDC(usuario, e.channel);
        }
    };
}

function configurarDC(usuario, dc) {
    dc.onopen = () => {
        console.log(`[WebRTC] Canal de datos ABIERTO con ${usuario}`);
        actualizarSidebarP2P();
    };
    dc.onclose = () => console.log(`[WebRTC] Canal de datos CERRADO con ${usuario}`);
    dc.onmessage = (e) => recibirMensajeP2P(usuario, e.data);
}

async function manejarSenalWebRTC(de, senal) {
    console.log(`[WebRTC] Señal recibida de ${de}:`, senal.tipo || 'candidate');
    
    // Si es una oferta, pre-inicializar la conexión para no perder candidatos
    if (senal.tipo === 'offer' && !p2pManager.has(de)) {
        console.log(`[WebRTC] Pre-inicializando conexión para oferta de ${de}`);
        const pc = new RTCPeerConnection(iceServers);
        const connection = { pc, dc: null, messages: [], unread: 0, status: 'Esperando...', candidateBuffer: [] };
        p2pManager.set(de, connection);
        configurarPC(de, pc);
        mostrarToastInvitacion(de, senal);
        return;
    }

    const conn = p2pManager.get(de);
    if (!conn) {
        console.warn(`[WebRTC] Señal ignorada de ${de}: No hay conexión activa.`);
        return;
    }

    try {
        if (senal.tipo === 'answer') {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
            console.log(`[WebRTC] Answer procesado para ${de}`);
            vaciarBufferCandidatos(de);
        } else if (senal.tipo === 'candidate')  {
            if (!conn.pc.remoteDescription) {
                console.log(`[WebRTC] Guardando candidato en buffer para ${de}`);
                conn.candidateBuffer.push(senal.candidate);
            } else {
                await conn.pc.addIceCandidate(new RTCIceCandidate(senal.candidate));
                console.log(`[WebRTC] Candidato ICE añadido para ${de}`);
            }
        }
    } catch (err) {
        console.error(`[WebRTC] Error procesando señal de ${de}:`, err);
    }
}

async function vaciarBufferCandidatos(usuario) {
    const conn = p2pManager.get(usuario);
    if (!conn || !conn.candidateBuffer.length) return;
    
    console.log(`[WebRTC] Procesando ${conn.candidateBuffer.length} candidatos del buffer para ${usuario}`);
    for (const cand of conn.candidateBuffer) {
        try {
            await conn.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
            console.warn(`[WebRTC] Error al añadir candidato del buffer para ${usuario}`, e);
        }
    }
    conn.candidateBuffer = [];
}

function mostrarToastInvitacion(usuario, senal) {
    const container = notificationsContainer || document.getElementById('notifications-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-content"><strong>${usuario}</strong> quiere iniciar un chat P2P</div>
        <div class="toast-actions">
            <button class="toast-btn" id="accept-${usuario}">Aceptar</button>
            <button class="toast-btn toast-btn-reject" id="reject-${usuario}">Rechazar</button>
        </div>
    `;
    container.appendChild(toast);

    document.getElementById(`accept-${usuario}`).onclick = async () => {
        const conn = p2pManager.get(usuario);
        if (!conn) return;

        console.log(`[WebRTC] Aceptando invitación de ${usuario}`);
        try {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
            const answer = await conn.pc.createAnswer();
            await conn.pc.setLocalDescription(answer);
            enviarSenal(usuario, { tipo: 'answer', sdp: answer });
            console.log(`[WebRTC] Answer enviado a ${usuario}`);
            
            vaciarBufferCandidatos(usuario);
            toast.remove();
            actualizarSidebarP2P();
            conmutarChatP2P(usuario);
        } catch (err) {
            console.error(`[WebRTC] Error al aceptar invitación de ${usuario}:`, err);
            cerrarConexionP2P(usuario, 'Error al establecer conexión');
        }
    };
    // Después — quita el toast Y cierra cualquier PC parcialmente creada
    document.getElementById(`reject-${usuario}`).onclick = () => {
        toast.remove();
        // Si por algún race condition ya se creó una PC para este usuario, limpiarla
        if (p2pManager.has(usuario)) {
            cerrarConexionP2P(usuario, 'Invitación rechazada');
        }
    };
}

function enviarSenal(para, data) {
    socket.send(JSON.stringify({ tipo: 'webrtc-signal', para, data }));
}

function recibirMensajeP2P(usuario, dataRaw) {
    const conn = p2pManager.get(usuario);
    if (!conn) return;

    try {
        const data = JSON.parse(dataRaw);
        const time = data.timestamp ? new Date(data.timestamp) : new Date();

        switch (data.tipo) {
            case 'chat':
                conn.messages.push({ de: usuario, texto: data.payload, time });
                if (activeP2PUser === usuario) {
                    mostrarMensajeEnVentana(usuario, data.payload, 'them', time);
                    // Si estamos viendo el chat, enviar confirmación de lectura de inmediato
                    enviarPorDC(usuario, 'seen', { id: data.id });
                } else {
                    conn.unread++;
                    actualizarSidebarP2P();
                }
                break;
            
            case 'typing':
                conn.typing = data.payload.escribiendo;
                if (activeP2PUser === usuario) actualizarP2PUI(usuario);
                break;

            case 'seen':
                // Opcional: Marcar mensaje con check azul en la UI
                console.log(`[WebRTC] Mensaje ${data.payload.id} visto por ${usuario}`);
                const ultimoMsg = conn.messages.filter(m => m.de === 'Tú').pop();
                if (ultimoMsg && activeP2PUser === usuario) {
                    // Podríamos añadir un indicador visual de "Visto"
                    const tiempos = p2pMessagesContainer.querySelectorAll('.p2p-msg-me .p2p-msg-time');
                    if (tiempos.length > 0) {
                        const ultimoTime = tiempos[tiempos.length - 1];
                        if (!ultimoTime.textContent.includes('✓✓')) {
                            ultimoTime.textContent += ' ✓✓';
                        }
                    }
                }
                break;
        }
    } catch (e) {
        console.error('[WebRTC] Error al parsear mensaje P2P:', e, dataRaw);
    }
}

function sendP2PMessage() {
    const texto = p2pMessageInput.value.trim();
    if (!texto || !activeP2PUser) return;
    
    const id = Math.random().toString(36).substr(2, 9);
    const enviado = enviarPorDC(activeP2PUser, 'chat', texto);
    
    if (enviado) {
        const time = new Date();
        const conn = p2pManager.get(activeP2PUser);
        conn.messages.push({ de: 'Tú', texto, time });
        mostrarMensajeEnVentana('Tú', texto, 'me', time);
        p2pMessageInput.value = '';
        
        // Resetear escritura al enviar
        if (p2pEstaEscribiendo) {
            p2pEstaEscribiendo = false;
            enviarPorDC(activeP2PUser, 'typing', { escribiendo: false });
        }
    }
}

function conmutarChatP2P(usuario) {
    const conn = p2pManager.get(usuario);
    if (!conn) return;
    activeP2PUser = usuario;
    conn.unread = 0;
    p2pModal.classList.remove('hidden');
    p2pTargetNameSpan.textContent = usuario;
    p2pMessagesContainer.innerHTML = '';    
    conn.messages.forEach(m => mostrarMensajeEnVentana(m.de, m.texto, m.de === 'Tú' ? 'me' : 'them', m.time));
    actualizarP2PUI(usuario);
    actualizarSidebarP2P();

    // Enviar confirmación de lectura para el último mensaje recibido
    const ultimoMensajeRecibido = conn.messages.filter(m => m.de !== 'Tú').pop();
    if (ultimoMensajeRecibido) {
        enviarPorDC(usuario, 'seen', { id: 'all' });
    }

    // Rehabilitar input
    p2pMessageInput.disabled = false;
    p2pMessageInput.placeholder = 'Escribe un mensaje privado P2P...';
    p2pSendButton.disabled = false;

    p2pMessageInput.focus();
}

function actualizarP2PUI(usuario) {
    const conn = p2pManager.get(usuario);
    if (!conn) return;
    const status = conn.status ? conn.status.toLowerCase() : '';
    
    if (conn.typing) {
        p2pStatusSpan.textContent = 'escribiendo...';
        p2pStatusSpan.className = 'status-typing';
    } else {
        p2pStatusSpan.textContent = conn.status || 'Desconocido';
        p2pStatusSpan.className = (status === 'connected' || status === 'open') ? 'status-open' : 'status-connecting';
    }
}

function actualizarSidebarP2P() {
    p2pActiveList.innerHTML = '';
    if (p2pManager.size > 0) p2pListSection.classList.remove('hidden');
    else p2pListSection.classList.add('hidden');

    p2pManager.forEach((conn, usuario) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${usuario}</span> ${conn.unread > 0 ? `<span class="unread-badge">${conn.unread}</span>` : ''}`;
        li.onclick = () => conmutarChatP2P(usuario);
        p2pActiveList.appendChild(li);
    });
}

function mostrarMensajeEnVentana(usuario, texto, clase, timestamp = null) {
    const div = document.createElement('div');
    div.className = `p2p-msg p2p-msg-${clase}`;

    const fecha = timestamp ? new Date(timestamp) : new Date();
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="p2p-msg-text">${sanitizeHtml(texto)}</div>
        <span class="p2p-msg-time">${hora}</span>
    `;
    p2pMessagesContainer.appendChild(div);
    p2pMessagesContainer.scrollTop = p2pMessagesContainer.scrollHeight;
}

function mostrarMensaje(data) {
    if (!data.mensaje && data.tipo !== 'error' && data.tipo !== 'sistema') {
        return;
    }

    const div = document.createElement('div');
    const usuario = data.usuario || 'Anónimo';
    const mensaje = data.mensaje || '';
    const color = getUserColor(usuario);
    const safeUser = sanitizeHtml(usuario);
    const safeMsg = sanitizeHtml(mensaje);

    // Formatear timestamp si viene del servidor, o usar hora local
    const fecha = data.timestamp ? new Date(data.timestamp) : new Date();
    const hora = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (data.tipo === 'error') {
        div.className = 'error-message';
        div.innerHTML = `
            <span class="error-icon">⚠</span>
            <span class="error-text">${safeMsg}</span>
        `;
    } else if (data.tipo === 'sistema') {
        div.className = 'server-message';
        div.innerHTML = `
            <span class="system-icon">ℹ</span>
            <span class="system-text">${safeMsg}</span>
        `;
    } else {
        div.className = 'user-message';
        // Aplicar el color del usuario como variable CSS para el borde izquierdo
        div.style.setProperty('--user-color', color);
        div.innerHTML = `
            <div class="username" style="color:${color}">${safeUser}</div>
            <div class="message-text">${safeMsg}</div>
            <div class="message-time">${hora}</div>
        `;
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}
