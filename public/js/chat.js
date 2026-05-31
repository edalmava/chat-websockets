/* Lógica del cliente WebSocket Chat con soporte de Supabase Auth y Roles */

let socket = null;
let reintentosConexion = 0;
const MAX_REINTENTOS = 5;
let reconexionTimeout = null;

let salasDisponibles = [];

// Elementos del DOM de Auth
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const authLoading = document.getElementById('auth-loading');

// Elementos del DOM del Chat
const chatContainer = document.getElementById('chat-container');
const userIdentity = document.getElementById('user-identity');
const currentUsernameSpan = document.getElementById('current-username');
const currentUserRoleSpan = document.getElementById('current-user-role');
const logoutButton = document.getElementById('logoutButton');
const sendButton = document.getElementById('sendButton');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('users');
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

// Elementos de Admin
const adminPanel = document.getElementById('admin-panel');
const adminUserSelect = document.getElementById('admin-user-select');
const adminRoleSelect = document.getElementById('admin-role-select');

// Banner de estado de conexión
const statusBanner = document.createElement('div');
statusBanner.id = 'connection-status';
statusBanner.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;display:none;';
document.body.appendChild(statusBanner);

// Variables de estado del usuario actual
let miNombreUsuario = '';
let miRol = 'user';
let miUserId = '';
let salaActual = '';
let estaEscribiendo = false;
let typingTimeout = null;
let cerrandoSesion = false;
let cierreIntencional = false;
const usuariosEscribiendo = new Set(); // Guarda los nombres de quienes escriben en el chat público

// GESTOR P2P MULTI-CHAT (Clave: targetUserId (UUID), Valor: { pc, dc, displayName, messages: [], unread: 0, status: '', typing: false })
const p2pManager = new Map();
let activeP2PUser = null; // Guarda el UUID del usuario con el que chateamos privadamente
let p2pEstaEscribiendo = false;
let p2pTypingTimeout = null;

let iceServers = null;
let iceConfigReady = null;
let resolveIceConfig = null;

// Mapa para guardar los displayNames de los usuarios conectados por su UUID
const mapaUsuariosEnLinea = new Map(); // Map<UUID, { displayName, role }>

function esperarIceConfig() {
    if (iceServers) return Promise.resolve(iceServers);
    if (!iceConfigReady) {
        iceConfigReady = new Promise(resolve => {
            resolveIceConfig = resolve;
        });
    }
    return iceConfigReady;
}

function obtenerUrlServer() {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev ? `ws://localhost:${CONFIG.WS_PORT || 8443}` : 'wss://chat.colsaba.site';
}

function actualizarStatusUI(mensaje, tipo = 'info') {
    statusBanner.textContent = mensaje;
    statusBanner.style.display = 'block';
    statusBanner.style.backgroundColor = tipo === 'success' ? '#dcfce7' : (tipo === 'error' ? '#fee2e2' : '#dbeafe');
    statusBanner.style.color = '#1f2937';
    if (tipo === 'success') setTimeout(() => statusBanner.style.display = 'none', 3000);
}

// ============================================
// LÓGICA DE AUTENTICACIÓN (FRONTEND UI)
// ============================================

function cambiarPestañaAuth(pestaña) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    authError.classList.add('hidden');
    
    if (pestaña === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}

async function manejarLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    mostrarCargandoAuth(true);
    authError.classList.add('hidden');
    
    const { data, error } = await iniciarSesion(email, password);
    
    if (error) {
        mostrarErrorAuth(error.message || 'Error al iniciar sesión');
        mostrarCargandoAuth(false);
    } else {
        miNombreUsuario = data.user.user_metadata?.display_name || email.split('@')[0];
        miUserId = data.user.id;
        conectar();
    }
}

async function manejarRegistroSubmit(event) {
    event.preventDefault();
    const displayName = document.getElementById('register-displayname').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    
    if (password !== confirm) {
        mostrarErrorAuth('Las contraseñas no coinciden');
        return;
    }
    
    mostrarCargandoAuth(true);
    authError.classList.add('hidden');
    
    const { data, error } = await registrarUsuario(email, password, displayName);
    
    if (error) {
        mostrarErrorAuth(error.message || 'Error al crear la cuenta');
        mostrarCargandoAuth(false);
    } else {
        mostrarCargandoAuth(false);
        if (data.session) {
            miNombreUsuario = displayName;
            miUserId = data.user.id;
            conectar();
        } else {
            alert('¡Cuenta registrada! Por favor verifica tu bandeja de entrada para confirmar tu correo antes de iniciar sesión.');
            cambiarPestañaAuth('login');
        }
    }
}

function mostrarErrorAuth(mensaje) {
    authError.textContent = mensaje;
    authError.classList.remove('hidden');
}

function mostrarCargandoAuth(cargando) {
    if (cargando) {
        authLoading.classList.remove('hidden');
    } else {
        authLoading.classList.add('hidden');
    }
}

function mostrarLogin() {
    loginContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    userIdentity.classList.add('hidden');
    mostrarCargandoAuth(false);
}

function mostrarChat() {
    loginContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    userIdentity.classList.remove('hidden');
}

// ============================================
// CONEXIÓN WEBSOCKET
// ============================================

async function conectar() {
    const token = await obtenerToken();
    if (!token) {
        mostrarLogin();
        return;
    }

    const baseUrl = obtenerUrlServer();
    const urlConToken = `${baseUrl}?token=${token}`;

    if (socket) socket.close();
    actualizarStatusUI('Conectando...', 'info');

    socket = new WebSocket(urlConToken);

    socket.addEventListener('open', () => {
        actualizarStatusUI('Conectado', 'success');
        reintentosConexion = 0;
        
        const salaAUnirse = salaActual || 'General';
        joinChat(salaAUnirse);
    });

    socket.addEventListener('close', (event) => {
        if (cierreIntencional) {
            cierreIntencional = false;
            return;
        }

        p2pManager.forEach((conn, targetId) => {
            cerrarConexionP2P(targetId, 'Desconectado del servidor de señalización');
        });

        if (event.code === 4001) {
            actualizarStatusUI('No autorizado / Token inválido', 'error');
            logout();
            return;
        }
        if (event.code === 4002) {
            actualizarStatusUI('Sesión iniciada en otra ubicación', 'error');
            mostrarLogin();
            mostrarErrorAuth('Tu sesión se cerró porque ingresaste desde otra ventana.');
            return;
        }
        if (event.code === 4003) {
            actualizarStatusUI('Expulsado de la sala', 'error');
            mostrarLogin();
            mostrarErrorAuth('Has sido expulsado del chat por un moderador.');
            return;
        }

        actualizarStatusUI('Desconectado', 'error');

        if (reintentosConexion < MAX_REINTENTOS) {
            reintentosConexion++;
            reconexionTimeout = setTimeout(conectar, 1000 * Math.pow(2, reintentosConexion));
        } else {
            mostrarLogin();
            mostrarErrorAuth('No se pudo establecer conexión con el servidor de chat.');
        }
    });

    socket.addEventListener('message', manejarMensaje);
}

onCambioEstadoAuth((event, session) => {
    if (event === 'TOKEN_REFRESHED' && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            tipo: 'token_refresh',
            token: session.access_token
        }));
    }
    if (event === 'SIGNED_OUT') {
        logout();
    }
});

async function logout() {
    if (cerrandoSesion) return;
    cerrandoSesion = true;
    try {
        await cerrarSesion();
        cierreIntencional = true;
        if (socket) {
            socket.close();
        }
        p2pManager.forEach((conn, targetId) => {
            cerrarConexionP2P(targetId, 'Sesión cerrada');
        });
        miNombreUsuario = '';
        miRol = 'user';
        miUserId = '';
        salaActual = '';
        mapaUsuariosEnLinea.clear();
        mostrarLogin();
    } finally {
        cerrandoSesion = false;
    }
}

// ============================================
// MENSAJERÍA WEBSOCKET
// ============================================

function joinChat(room) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ tipo: 'join', sala: room }));
    }
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || socket.readyState !== WebSocket.OPEN) return;
    
    if (messageInput.disabled) return;

    socket.send(JSON.stringify({ tipo: 'chat', mensaje: message }));
    messageInput.value = '';
    
    if (estaEscribiendo) {
        estaEscribiendo = false;
        socket.send(JSON.stringify({ tipo: 'typing', escribiendo: false }));
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());

messageInput.addEventListener('input', () => {
    if (!estaEscribiendo && socket.readyState === WebSocket.OPEN) {
        estaEscribiendo = true;
        socket.send(JSON.stringify({ tipo: 'typing', escribiendo: true }));
    }

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

closeP2PButton.addEventListener('click', () => { 
    p2pModal.classList.add('hidden'); 
    activeP2PUser = null; 
});

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

function manejarMensaje(event) {
    const data = JSON.parse(event.data);
    if (!data.tipo) return;

    switch (data.tipo) {
        case 'auth-info':
            miRol = data.role;
            miNombreUsuario = data.displayName;
            miUserId = data.userId;
            
            currentUsernameSpan.textContent = miNombreUsuario;
            currentUserRoleSpan.textContent = miRol;
            currentUserRoleSpan.className = `role-badge role-${miRol}`;
            
            actualizarInterfazModeracion();
            mostrarChat();
            break;

        case 'join-success':
            const esPrimerIngreso = !salaActual;
            salaActual = data.sala;

            if (esPrimerIngreso) {
                mostrarChat();
            } else {
                messages.innerHTML = '';
                usuariosEscribiendo.clear();
                actualizarIndicadorEscritura();
            }
            
            actualizarSalaActiva(salaActual);
            break;

        case 'token_refresh_ok':
            miRol = data.role;
            miNombreUsuario = data.displayName;
            currentUsernameSpan.textContent = miNombreUsuario;
            currentUserRoleSpan.textContent = miRol;
            currentUserRoleSpan.className = `role-badge role-${miRol}`;
            actualizarInterfazModeracion();
            break;

        case 'ice-config':
            iceServers = data.config;
            if (resolveIceConfig) {
                resolveIceConfig(iceServers);
                resolveIceConfig = null;
            }
            console.log('[ICE] Configuración recibida.');
            break;

        case 'salas-disponibles':
            renderizarSalas(data.salas);
            salasDisponibles = data.salas;
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
            manejarSenalWebRTC(data.de, data.deNombre, data.data);
            break;

        case 'kicked':
            mostrarMensaje({
                tipo: 'error',
                mensaje: `Fuiste expulsado por el moderador ${data.payload.por}. Motivo: ${data.payload.motivo}`,
                timestamp: new Date().toISOString()
            });
            alert(`Has sido expulsado por ${data.payload.por}.\nMotivo: ${data.payload.motivo}`);
            logout();
            break;

        case 'muted':
            mostrarMensaje({
                tipo: 'error',
                mensaje: `Fuiste silenciado por el moderador ${data.payload.por} durante ${data.payload.duracion} segundos.`,
                timestamp: new Date().toISOString()
            });
            deshabilitarInputChat(data.payload.duracion);
            break;

        case 'rol_actualizado':
            miRol = data.payload.nuevoRol;
            alert(`Tu rol ha sido actualizado a: ${miRol}`);
            break;

        case 'chat':
        case 'sistema':
        case 'error':
            mostrarMensaje(data);
            break;
            
        default:
            break;
    }
}

function deshabilitarInputChat(segundos) {
    messageInput.disabled = true;
    sendButton.disabled = true;
    messageInput.placeholder = `Silenciado temporalmente por ${segundos}s...`;
    
    let restante = segundos;
    const interval = setInterval(() => {
        restante--;
        if (restante <= 0) {
            clearInterval(interval);
            messageInput.disabled = false;
            sendButton.disabled = false;
            messageInput.placeholder = 'Escribe tu mensaje...';
        } else {
            messageInput.placeholder = `Silenciado temporalmente por ${restante}s...`;
        }
    }, 1000);
}

function actualizarInterfazModeracion() {
    const esAdmin = miRol === 'admin';
    if (esAdmin) {
        adminPanel.classList.remove('hidden');
    } else {
        adminPanel.classList.add('hidden');
    }
}

function actualizarSalaActiva(sala) {
    document.querySelectorAll('#rooms li').forEach(li => {
        li.classList.toggle('active', li.dataset.room === sala);
    });
}

function renderizarSalas(salas) {
    const roomsList = document.getElementById('rooms');
    roomsList.innerHTML = '';
    salas.forEach(sala => {
        const li = document.createElement('li');
        li.textContent = sala;
        li.dataset.room = sala;
        if (sala === salaActual) li.classList.add('active');
        li.onclick = () => cambiarSala(sala);
        roomsList.appendChild(li);
    });
}

function cambiarSala(nuevaSala) {
    if (nuevaSala === salaActual) return;
    socket.send(JSON.stringify({
        tipo: 'join',
        sala: nuevaSala
    }));
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
    mapaUsuariosEnLinea.clear();
    adminUserSelect.innerHTML = '<option value="">Selecciona usuario...</option>';

    const soyModeradorOAdmin = miRol === 'moderator' || miRol === 'admin';

    usuarios.forEach((usuario) => {
        mapaUsuariosEnLinea.set(usuario.userId, {
            displayName: usuario.displayName,
            role: usuario.role
        });

        if (usuario.userId === miUserId) return;

        const li = document.createElement('li');
        li.style.borderLeftColor = getUserColor(usuario.displayName);
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        
        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong>${sanitizeHtml(usuario.displayName)}</strong> <span class="role-badge role-${usuario.role}" style="font-size:10px;padding:2px 6px;margin-left:6px">${usuario.role}</span>`;
        textSpan.style.cursor = 'pointer';
        textSpan.onclick = () => abrirVentanaP2P(usuario.userId);
        li.appendChild(textSpan);

        if (soyModeradorOAdmin && usuario.role !== 'admin' && !(miRol === 'moderator' && usuario.role === 'moderator')) {
            const modControls = document.createElement('div');
            modControls.className = 'mod-user-controls';
            
            const kickBtn = document.createElement('button');
            kickBtn.textContent = 'Expulsar';
            kickBtn.className = 'btn-mod-action btn-kick';
            kickBtn.onclick = (e) => {
                e.stopPropagation();
                const motivo = prompt(`Expulsar a ${usuario.displayName}. Motivo:`, 'Infracción de las reglas');
                if (motivo !== null) kickUser(usuario.userId, motivo);
            };
            modControls.appendChild(kickBtn);

            const muteBtn = document.createElement('button');
            muteBtn.textContent = 'Mute';
            muteBtn.className = 'btn-mod-action btn-mute';
            muteBtn.onclick = (e) => {
                e.stopPropagation();
                const segs = prompt(`Silenciar a ${usuario.displayName} por cuántos segundos? (máx 3600)`, '60');
                if (segs) {
                    const num = parseInt(segs);
                    if (!isNaN(num) && num > 0) {
                        muteUser(usuario.userId, num);
                    } else {
                        alert('Número inválido');
                    }
                }
            };
            modControls.appendChild(muteBtn);

            li.appendChild(modControls);
        }

        usersList.appendChild(li);

        if (miRol === 'admin') {
            const option = document.createElement('option');
            option.value = usuario.userId;
            option.textContent = `${usuario.displayName} (${usuario.role})`;
            adminUserSelect.appendChild(option);
        }
    });
}

function kickUser(userId, motivo) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            tipo: 'kick_user',
            payload: { userId, motivo }
        }));
    }
}

function muteUser(userId, duracion) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            tipo: 'mute_user',
            payload: { userId, duracion }
        }));
    }
}

function aplicarChangeRoleAdmin() {
    const targetUserId = adminUserSelect.value;
    const nuevoRol = adminRoleSelect.value;
    
    if (!targetUserId) {
        alert('Por favor selecciona un usuario');
        return;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            tipo: 'cambiar_rol',
            payload: { userId: targetUserId, nuevoRol }
        }));
    }
}

// ============================================
// LÓGICA CHAT P2P (WEBRTC)
// ============================================

function cerrarConexionP2P(targetUserId, motivo = 'Conexión cerrada') {
    const conn = p2pManager.get(targetUserId);
    if (!conn) return;

    if (conn.dc && conn.dc.readyState !== 'closed') {
        conn.dc.close();
    }
    if (conn.pc && conn.pc.connectionState !== 'closed') {
        conn.pc.close();
    }

    if (activeP2PUser === targetUserId) {
        const div = document.createElement('div');
        div.className = 'p2p-msg p2p-msg-them';
        div.innerHTML = `<div class="p2p-msg-text" style="color:var(--text-muted);font-style:italic">
            ⚠️ ${motivo}
        </div>`;
        p2pMessagesContainer.appendChild(div);
        p2pMessagesContainer.scrollTop = p2pMessagesContainer.scrollHeight;

        p2pMessageInput.disabled = true;
        p2pMessageInput.placeholder = 'Conexión cerrada';
        p2pSendButton.disabled = true;
    }

    p2pManager.delete(targetUserId);
    actualizarSidebarP2P();
}

async function abrirVentanaP2P(targetUserId) {
    if (!p2pManager.has(targetUserId)) {
        await iniciarConexionP2P(targetUserId);
    }
    conmutarChatP2P(targetUserId);
}

async function iniciarConexionP2P(targetUserId) {
    console.log(`[WebRTC] Iniciando conexión con UUID: ${targetUserId}`);

    const config = await esperarIceConfig();
    const pc = new RTCPeerConnection(config);
    
    const uInfo = mapaUsuariosEnLinea.get(targetUserId);
    const displayName = uInfo ? uInfo.displayName : 'Usuario P2P';

    const connection = { 
        pc, 
        dc: null, 
        displayName, 
        messages: [], 
        unread: 0, 
        status: 'Conectando...', 
        candidateBuffer: [] 
    };
    p2pManager.set(targetUserId, connection);
    
    configurarPC(targetUserId, pc);
    const dc = pc.createDataChannel('chat');
    connection.dc = dc;
    configurarDC(targetUserId, dc);

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        enviarSenal(targetUserId, { tipo: 'offer', sdp: offer });
        actualizarSidebarP2P();
    } catch (err) {
        console.error(`[WebRTC] Error al crear oferta:`, err);
    }
}

function configurarPC(targetUserId, pc) {
    pc.onicecandidate = (e) => {
        if (e.candidate) {
            enviarSenal(targetUserId, { tipo: 'candidate', candidate: e.candidate });
        }
    };

    pc.onconnectionstatechange = () => {
        const conn = p2pManager.get(targetUserId);
        if (!conn) return;

        conn.status = pc.connectionState;
        if (activeP2PUser === targetUserId) actualizarP2PUI(targetUserId);

        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            const motivo = pc.connectionState === 'failed'
                ? 'Conexión WebRTC fallida'
                : `${conn.displayName} se ha desconectado`;
            cerrarConexionP2P(targetUserId, motivo);
        }
    };

    pc.ondatachannel = (e) => {
        const conn = p2pManager.get(targetUserId);
        if (conn) {
            conn.dc = e.channel;
            configurarDC(targetUserId, e.channel);
        }
    };
}

function configurarDC(targetUserId, dc) {
    dc.onopen = () => {
        actualizarSidebarP2P();
    };
    dc.onclose = () => {
        cerrarConexionP2P(targetUserId, 'Canal de datos cerrado');
    };
    dc.onmessage = (e) => recibirMensajeP2P(targetUserId, e.data);
}

async function manejarSenalWebRTC(de, deNombre, senal) {
    if (senal.tipo === 'offer' && !p2pManager.has(de)) {
        const config = await esperarIceConfig();
        const pc = new RTCPeerConnection(config);
        const connection = { 
            pc, 
            dc: null, 
            displayName: deNombre, 
            messages: [], 
            unread: 0, 
            status: 'Esperando...', 
            candidateBuffer: [] 
        };
        p2pManager.set(de, connection);
        configurarPC(de, pc);
        mostrarToastInvitacion(de, deNombre, senal);
        return;
    }

    const conn = p2pManager.get(de);
    if (!conn) return;

    try {
        if (senal.tipo === 'answer') {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
            vaciarBufferCandidatos(de);
        } else if (senal.tipo === 'candidate')  {
            if (!conn.pc.remoteDescription) {
                conn.candidateBuffer.push(senal.candidate);
            } else {
                await conn.pc.addIceCandidate(new RTCIceCandidate(senal.candidate));
            }
        }
    } catch (err) {
        console.error(`[WebRTC] Error procesando señal de ${deNombre}:`, err);
    }
}

async function vaciarBufferCandidatos(targetUserId) {
    const conn = p2pManager.get(targetUserId);
    if (!conn || !conn.candidateBuffer.length) return;
    
    for (const cand of conn.candidateBuffer) {
        try {
            await conn.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
            console.warn(`[WebRTC] Error al vaciar candidato del buffer`, e);
        }
    }
    conn.candidateBuffer = [];
}

function mostrarToastInvitacion(deUserId, deNombre, senal) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const safeName = sanitizeHtml(deNombre);
    toast.innerHTML = `
        <div class="toast-content"><strong>${safeName}</strong> quiere iniciar un chat privado</div>
        <div class="toast-actions">
            <button class="toast-btn" id="accept-${deUserId}">Aceptar</button>
            <button class="toast-btn toast-btn-reject" id="reject-${deUserId}">Rechazar</button>
        </div>
    `;
    notificationsContainer.appendChild(toast);

    document.getElementById(`accept-${deUserId}`).onclick = async () => {
        const conn = p2pManager.get(deUserId);
        if (!conn) return;

        try {
            await conn.pc.setRemoteDescription(new RTCSessionDescription(senal.sdp));
            const answer = await conn.pc.createAnswer();
            await conn.pc.setLocalDescription(answer);
            enviarSenal(deUserId, { tipo: 'answer', sdp: answer });
            
            vaciarBufferCandidatos(deUserId);
            toast.remove();
            actualizarSidebarP2P();
            conmutarChatP2P(deUserId);
        } catch (err) {
            cerrarConexionP2P(deUserId, 'Error en el acuerdo de conexión');
        }
    };
    
    document.getElementById(`reject-${deUserId}`).onclick = () => {
        toast.remove();
        cerrarConexionP2P(deUserId, 'Invitación rechazada');
    };
}

function enviarSenal(para, data) {
    socket.send(JSON.stringify({ tipo: 'webrtc-signal', para, data }));
}

function enviarPorDC(targetUserId, tipo, payload) {
    const conn = p2pManager.get(targetUserId);
    if (conn && conn.dc && conn.dc.readyState === 'open') {
        conn.dc.send(JSON.stringify({
            tipo,
            payload,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9)
        }));
        return true;
    }
    return false;
}

function recibirMensajeP2P(deUserId, dataRaw) {
    const conn = p2pManager.get(deUserId);
    if (!conn) return;

    try {
        const data = JSON.parse(dataRaw);
        const time = data.timestamp ? new Date(data.timestamp) : new Date();

        switch (data.tipo) {
            case 'chat':
                conn.messages.push({ de: conn.displayName, texto: data.payload, time });
                if (activeP2PUser === deUserId) {
                    mostrarMensajeEnVentana(conn.displayName, data.payload, 'them', time);
                    enviarPorDC(deUserId, 'seen', { id: data.id });
                } else {
                    conn.unread++;
                    actualizarSidebarP2P();
                }
                break;
            
            case 'typing':
                conn.typing = data.payload.escribiendo;
                if (activeP2PUser === deUserId) actualizarP2PUI(deUserId);
                break;

            case 'seen':
                const ultimoMsg = conn.messages.filter(m => m.de === 'Tú').pop();
                if (ultimoMsg && activeP2PUser === deUserId) {
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
        console.error('[WebRTC] Error parseo mensaje P2P:', e);
    }
}

function sendP2PMessage() {
    const texto = p2pMessageInput.value.trim();
    if (!texto || !activeP2PUser) return;
    
    const enviado = enviarPorDC(activeP2PUser, 'chat', texto);
    
    if (enviado) {
        const time = new Date();
        const conn = p2pManager.get(activeP2PUser);
        conn.messages.push({ de: 'Tú', texto, time });
        mostrarMensajeEnVentana('Tú', texto, 'me', time);
        p2pMessageInput.value = '';
        
        if (p2pEstaEscribiendo) {
            p2pEstaEscribiendo = false;
            enviarPorDC(activeP2PUser, 'typing', { escribiendo: false });
        }
    }
}

function conmutarChatP2P(targetUserId) {
    const conn = p2pManager.get(targetUserId);
    if (!conn) return;

    activeP2PUser = targetUserId;
    conn.unread = 0;
    
    p2pModal.classList.remove('hidden');
    p2pTargetNameSpan.textContent = conn.displayName;
    p2pMessagesContainer.innerHTML = '';
    
    conn.messages.forEach(m => mostrarMensajeEnVentana(m.de, m.texto, m.de === 'Tú' ? 'me' : 'them', m.time));
    actualizarP2PUI(targetUserId);
    actualizarSidebarP2P();

    const ultimoRecibido = conn.messages.filter(m => m.de !== 'Tú').pop();
    if (ultimoRecibido) {
        enviarPorDC(targetUserId, 'seen', { id: 'all' });
    }

    p2pMessageInput.disabled = false;
    p2pMessageInput.placeholder = 'Escribe un mensaje privado P2P...';
    p2pSendButton.disabled = false;
    p2pMessageInput.focus();
}

function actualizarP2PUI(targetUserId) {
    const conn = p2pManager.get(targetUserId);
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

    p2pManager.forEach((conn, targetUserId) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${sanitizeHtml(conn.displayName)}</span> ${conn.unread > 0 ? `<span class="unread-badge">${conn.unread}</span>` : ''}`;
        li.onclick = () => conmutarChatP2P(targetUserId);
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

// Cierre de sesión y limpieza de P2P
function cerrarTodasLasConexionesP2P() {
    p2pManager.forEach((conn, targetUserId) => {
        cerrarConexionP2P(targetUserId, 'Sesión cerrada');
    });
}

// ============================================
// INICIALIZACIÓN AL CARGAR LA PÁGINA
// ============================================
async function inicializarApp() {
    try {
        const session = await obtenerSesion();
        if (session) {
            miNombreUsuario = session.user.user_metadata?.display_name || session.user.email.split('@')[0];
            miUserId = session.user.id;
            conectar();
        } else {
            mostrarLogin();
        }
    } catch (e) {
        console.error('Error al inicializar app:', e);
        mostrarLogin();
    }
}

// Iniciar aplicación
window.addEventListener('DOMContentLoaded', inicializarApp);

// Añadimos el handler global para el botón de asignar rol de admin
window.aplicarCambioRolAdmin = aplicarChangeRoleAdmin;
