const socket = new WebSocket('ws://localhost:8443');

// Elementos del DOM
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const loginUsernameInput = document.getElementById('loginUsernameInput');
const joinButton = document.getElementById('joinButton');
const userIdentity = document.getElementById('user-identity');
const currentUsernameSpan = document.getElementById('current-username');

const sendButton = document.getElementById('sendButton');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('users');

let miNombreUsuario = '';

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
    // Si ves error de certificado auto-firmado, acepta la excepción del navegador
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
    const username = loginUsernameInput.value.trim();
    if (username === '') return;

    const joinData = {
        tipo: 'join',
        usuario: username
    };

    socket.send(JSON.stringify(joinData));
    miNombreUsuario = username;
}

/**
 * Envía un mensaje de chat normal
 */
function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;
    
    const messageData = { 
        tipo: 'chat',
        mensaje: message 
    };
    
    socket.send(JSON.stringify(messageData));
    messageInput.value = '';
} 

// Listeners de eventos
joinButton.addEventListener('click', joinChat);
loginUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    
    // MANEJO SEGÚN TIPO DE MENSAJE
    switch (data.tipo) {
        case 'join-success':
            // Ocultar login y mostrar chat
            loginContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            
            // Mostrar identidad del usuario
            userIdentity.classList.remove('hidden');
            currentUsernameSpan.textContent = miNombreUsuario;
            
            messageInput.focus();
            console.log('🎉 Unido exitosamente como:', miNombreUsuario);
            break;

        case 'lista-usuarios':
            actualizarListaUsuarios(data.usuarios);
            break;

        case 'error':
            mostrarMensaje(data);
            // Si el error ocurrió durante el join, no ocultamos el login
            break;

        default:
            mostrarMensaje(data);
            break;
    }
});

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
        // Mensajes de error
        messageElement.classList.add('error-message');
        messageElement.innerHTML = `
            <div class="error-icon">⚠️</div>
            <div class="error-text">${messageText}</div>
        `;
    } else if (isSystemMessage || isServerMessage) {
        // Mensajes del servidor/sistema
        messageElement.classList.add('server-message');
        messageElement.innerHTML = `
            <div class="system-icon">ℹ️</div>
            <div class="system-text">${messageText}</div>
            <div class="message-time">${formatTime(data.timestamp)}</div>
        `;
    } else {
        // Mensajes de usuario
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

/**
 * Formatea el timestamp ISO al formato local
 */
function formatTime(isoTimestamp) {
    if (!isoTimestamp) return '';
    try {
        const date = new Date(isoTimestamp);
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}