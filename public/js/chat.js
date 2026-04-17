const socket = new WebSocket('ws://localhost:8443');

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

let miNombreUsuario = '';
let salaActual = '';
let estaEscribiendo = false;
let typingTimeout = null;
const usuariosEscribiendo = new Set();

// ============================================
// SANITIZACIÓN XSS EN CLIENTE (Defensa en profundidad)
// ============================================

/**
 * Escapa caracteres HTML para prevenir XSS
 */
function sanitizeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Paleta de colores para los usuarios
const colorPalette = [
    '#2563eb', // Azul
    '#dc2626', // Rojo
    '#16a34a', // Verde
    '#ea580c', // Naranja
    '#7c3aed', // Púrpura
    '#0891b2', // Cian
    '#d97706', // Ámbar
    '#db2777', // Rosa
    '#059669', // Esmeralda
    '#1f2937', // Gris
    '#7f1d1d', // Rojo oscuro
    '#1e40af'  // Azul oscuro
];

// Mapa para almacenar el color de cada usuario
const userColors = {};
let colorIndex = 0;

// Función para obtener o asignar un color a un usuario
function getUserColor(username) {
    if (!userColors[username]) {
        userColors[username] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
    }
    return userColors[username];
}

socket.addEventListener('open', () => {
    console.log('✅ Conexión WSS establecida con el servidor de forma segura');
});

socket.addEventListener('error', (event) => {
    console.error('❌ Error de conexión WSS:', event);
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = 'background-color: #fee2e2; border: 1px solid #dc2626; color: #7f1d1d; padding: 12px; border-radius: 6px; margin-bottom: 10px';
    errorMsg.innerHTML = `
        <strong>⚠️ Error de conexión:</strong><br>
        Si ves un error de certificado, es normal (certificado auto-firmado para desarrollo).<br>
        Abre el navegador devtools (F12) y acepta la excepción de seguridad.
    `;
    document.body.insertBefore(errorMsg, document.body.firstChild);
});

/**
 * Envía solicitud para unirse al chat
 */
function joinChat() {
    const username = miNombreUsuario || loginUsernameInput.value.trim();
    const room = loginRoomSelect.value;
    
    if (username === '') return;

    const joinData = {
        tipo: 'join',
        usuario: username,
        sala: room
    };

    socket.send(JSON.stringify(joinData));
    miNombreUsuario = username;
}

/**
 * Cambia de sala
 */
function cambiarSala(nuevaSala) {
    if (nuevaSala === salaActual) return;

    const joinData = {
        tipo: 'join',
        usuario: miNombreUsuario,
        sala: nuevaSala
    };

    socket.send(JSON.stringify(joinData));
}

/**
 * Envía un mensaje de chat normal
 */
function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;
    
    detenerNotificacionEscritura();

    const messageData = { 
        tipo: 'chat',
        mensaje: message 
    };
    
    socket.send(JSON.stringify(messageData));
    messageInput.value = '';
} 

/**
 * Notifica al servidor el estado de escritura
 */
function enviarEstadoEscritura(escribiendo) {
    if (estaEscribiendo === escribiendo) return;
    estaEscribiendo = escribiendo;

    socket.send(JSON.stringify({
        tipo: 'typing',
        escribiendo: escribiendo
    }));
}

function detenerNotificacionEscritura() {
    enviarEstadoEscritura(false);
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

// Listeners de eventos
joinButton.addEventListener('click', joinChat);
loginUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

// Cambiar de sala al hacer clic en el sidebar
roomListItems.forEach(item => {
    item.addEventListener('click', () => {
        const nuevaSala = item.getAttribute('data-room');
        cambiarSala(nuevaSala);
    });
});

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Detectar escritura
messageInput.addEventListener('input', () => {
    enviarEstadoEscritura(true);

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        enviarEstadoEscritura(false);
        typingTimeout = null;
    }, 2000);
});

socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.tipo) {
        case 'join-success':
            // Si es un cambio de sala, limpiar mensajes y actualizar UI
            if (salaActual !== data.sala) {
                messages.innerHTML = '';
                usuariosEscribiendo.clear();
                actualizarVisualizacionTyping();
                
                // Actualizar clase activa en sidebar
                roomListItems.forEach(li => {
                    li.classList.toggle('active', li.getAttribute('data-room') === data.sala);
                });
            }

            salaActual = data.sala;
            
            // Ocultar login y mostrar chat
            loginContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            
            // Mostrar identidad del usuario
            userIdentity.classList.remove('hidden');
            currentUsernameSpan.textContent = miNombreUsuario;
            
            messageInput.focus();
            console.log(`🎉 Unido exitosamente a [${salaActual}] como:`, miNombreUsuario);
            break;

        case 'lista-usuarios':
            actualizarListaUsuarios(data.usuarios);
            break;

        case 'user-typing':
            manejarIndicadorEscritura(data.usuario, data.escribiendo);
            break;

        case 'error':
            mostrarMensaje(data);
            break;

        default:
            mostrarMensaje(data);
            break;
    }
});

function manejarIndicadorEscritura(usuario, escribiendo) {
    if (escribiendo) {
        usuariosEscribiendo.add(usuario);
    } else {
        usuariosEscribiendo.delete(usuario);
    }

    actualizarVisualizacionTyping();
}

function actualizarVisualizacionTyping() {
    const lista = Array.from(usuariosEscribiendo);
    
    if (lista.length === 0) {
        typingIndicator.textContent = '';
        typingIndicator.classList.add('hidden');
    } else {
        typingIndicator.classList.remove('hidden');
        if (lista.length === 1) {
            typingIndicator.textContent = `${lista[0]} está escribiendo...`;
        } else if (lista.length === 2) {
            typingIndicator.textContent = `${lista[0]} y ${lista[1]} están escribiendo...`;
        } else {
            typingIndicator.textContent = 'Varios usuarios están escribiendo...';
        }
    }
}

function actualizarListaUsuarios(usuarios) {
    usersList.innerHTML = '';
    usuarios.forEach((usuario) => {
        const userElement = document.createElement('li');
        userElement.textContent = usuario;
        const color = getUserColor(usuario);
        userElement.style.borderLeftColor = color;
        usersList.appendChild(userElement);
    });
}

function mostrarMensaje(data) {
    const username = data.usuario || 'Anónimo';
    const messageText = data.mensaje; 

    const messageElement = document.createElement('div');
    const isServerMessage = username === 'Servidor';
    const isErrorMessage = data.tipo === 'error';
    const isSystemMessage = data.tipo === 'sistema';
    
    if (isErrorMessage) {
        messageElement.classList.add('error-message');
        messageElement.innerHTML = `
            <div class="error-icon">⚠️</div>
            <div class="error-text">${messageText}</div>
        `;
    } else if (isSystemMessage || isServerMessage) {
        messageElement.classList.add('server-message');
        messageElement.innerHTML = `
            <div class="system-icon">ℹ️</div>
            <div class="system-text">${messageText}</div>
            <div class="message-time">${formatTime(data.timestamp)}</div>
        `;
    } else {
        messageElement.classList.add('user-message');
        const userColor = getUserColor(username);
        messageElement.style.setProperty('--user-color', userColor);
        
        const usernameElement = document.createElement('div');
        usernameElement.classList.add('username');
        usernameElement.textContent = username;
        usernameElement.style.color = userColor;
        
        const textElement = document.createElement('div');
        textElement.classList.add('message-text');
        textElement.textContent = messageText;
        
        const timeElement = document.createElement('div');
        timeElement.classList.add('message-time');
        timeElement.textContent = formatTime(data.timestamp);
        
        messageElement.appendChild(usernameElement);
        messageElement.appendChild(textElement);
        messageElement.appendChild(timeElement);
    }
    
    messages.appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight;
}

function formatTime(isoTimestamp) {
    if (!isoTimestamp) return '';
    try {
        const date = new Date(isoTimestamp);
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}
