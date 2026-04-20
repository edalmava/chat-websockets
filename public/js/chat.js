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
const p2pManager = new Map(); // Clave: usuario, Valor: { pc, dc, messages: [], unread: 0, status: '' }
let activeP2PUser = null;

const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
}

// LISTENERS
joinButton.addEventListener('click', () => joinChat());
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
p2pSendButton.addEventListener('click', sendP2PMessage);
p2pMessageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendP2PMessage());
closeP2PButton.addEventListener('click', () => { p2pModal.classList.add('hidden'); activeP2PUser = null; });

function manejarMensaje(event) {
    const data = JSON.parse(event.data);
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
        case 'webrtc-signal':
            manejarSenalWebRTC(data.de, data.data);
            break;
        default:
            mostrarMensaje(data);
            break;
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

async function abrirVentanaP2P(usuario) {
    if (!p2pManager.has(usuario)) {
        await iniciarConexionP2P(usuario);
    }
    conmutarChatP2P(usuario);
}

async function iniciarConexionP2P(usuario) {
    const pc = new RTCPeerConnection(iceServers);
    const connection = { pc, dc: null, messages: [], unread: 0, status: 'Conectando...' };
    p2pManager.set(usuario, connection);
    
    configurarPC(usuario, pc);
    const dc = pc.createDataChannel('chat');
    connection.dc = dc;
    configurarDC(usuario, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    enviarSenal(usuario, { tipo: 'offer', sdp: offer });
    actualizarSidebarP2P();
}

function configurarPC(usuario, pc) {
    pc.onicecandidate = (e) => e.candidate && enviarSenal(usuario, { tipo: 'candidate', candidate: e.candidate });
    pc.onconnectionstatechange = () => {
        const conn = p2pManager.get(usuario);
        if (!conn) return;
        conn.status = pc.connectionState;
        if (activeP2PUser === usuario) actualizarP2PUI(usuario);
    };
    pc.ondatachannel = (e) => {
        const conn = p2pManager.get(usuario);
        if (conn) {
            conn.dc = e.channel;
            configurarDC(usuario, e.channel);
        }
    };
}

function configurarDC(usuario, dc) {
    dc.onopen = () => actualizarSidebarP2P();
    dc.onmessage = (e) => recibirMensajeP2P(usuario, e.data);
}

async function manejarSenalWebRTC(de, senal) {
    if (senal.tipo === 'offer' && !p2pManager.has(de)) {
        mostrarToastInvitacion(de, senal);
        return;
    }
    const conn = p2pManager.get(de);
    if (!conn) return;

    if (senal.tipo === 'answer') await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
    else if (senal.tipo === 'candidate') await conn.pc.addIceCandidate(new RTCIceCandidate(senal.candidate));
}

function mostrarToastInvitacion(usuario, senal) {
    const container = notificationsContainer || document.getElementById('notifications-container');
    if (!container) {
        console.error('Error: No se encontró el contenedor de notificaciones');
        return;
    }

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
        const pc = new RTCPeerConnection(iceServers);
        const connection = { pc, dc: null, messages: [], unread: 0, status: 'Conectando...' };
        p2pManager.set(usuario, connection);
        configurarPC(usuario, pc);
        
        await pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        enviarSenal(usuario, { tipo: 'answer', sdp: answer });
        
        toast.remove();
        actualizarSidebarP2P();
        conmutarChatP2P(usuario);
    };
    document.getElementById(`reject-${usuario}`).onclick = () => toast.remove();
}

function enviarSenal(para, data) {
    socket.send(JSON.stringify({ tipo: 'webrtc-signal', para, data }));
}

function recibirMensajeP2P(usuario, texto) {
    const conn = p2pManager.get(usuario);
    if (!conn) return;
    conn.messages.push({ de: usuario, texto, time: new Date() });
    if (activeP2PUser === usuario) {
        mostrarMensajeEnVentana(usuario, texto, 'them');
    } else {
        conn.unread++;
        actualizarSidebarP2P();
    }
}

function sendP2PMessage() {
    const texto = p2pMessageInput.value.trim();
    if (!texto || !activeP2PUser) return;
    const conn = p2pManager.get(activeP2PUser);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
        conn.dc.send(texto);
        conn.messages.push({ de: 'Tú', texto, time: new Date() });
        mostrarMensajeEnVentana('Tú', texto, 'me');
        p2pMessageInput.value = '';
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
    conn.messages.forEach(m => mostrarMensajeEnVentana(m.de, m.texto, m.de === 'Tú' ? 'me' : 'them'));
    actualizarP2PUI(usuario);
    actualizarSidebarP2P();
    p2pMessageInput.focus();
}

function actualizarP2PUI(usuario) {
    const conn = p2pManager.get(usuario);
    if (!conn) return;
    const status = conn.status ? conn.status.toLowerCase() : '';
    p2pStatusSpan.textContent = conn.status || 'Desconocido';
    p2pStatusSpan.className = (status === 'connected' || status === 'open') ? 'status-open' : 'status-connecting';
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

function mostrarMensajeEnVentana(usuario, texto, clase) {
    const div = document.createElement('div');
    div.className = `p2p-msg p2p-msg-${clase}`;
    div.innerHTML = `<div class="p2p-msg-text">${sanitizeHtml(texto)}</div>`;
    p2pMessagesContainer.appendChild(div);
    p2pMessagesContainer.scrollTop = p2pMessagesContainer.scrollHeight;
}

function mostrarMensaje(data) {
    const div = document.createElement('div');
    div.className = data.tipo === 'error' ? 'error-message' : (data.tipo === 'sistema' ? 'server-message' : 'user-message');
    const color = getUserColor(data.usuario || 'Anónimo');
    div.innerHTML = `<div class="username" style="color:${color}">${data.usuario || ''}</div><div>${data.mensaje}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}
