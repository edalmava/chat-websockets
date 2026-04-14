const socket = new WebSocket('ws://localhost:8080');

const sendButton = document.getElementById('sendButton');
const messages = document.getElementById('messages');
const usernameInput = document.getElementById('usernameInput');
const messageInput = document.getElementById('messageInput');
const usersList = document.getElementById('users');

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
    console.log('Conexión establecida con el servidor');
});

function sendMessage() {
    const message = messageInput.value.trim();
    const username = usernameInput.value.trim();

    if (username === '' || message === '') {
        return; // No enviar mensajes sin nombre de usuario o vacíos
    }
    
    const messageData = { usuario: username, mensaje: message };
    
    socket.send(JSON.stringify(messageData));
    console.log('Mensaje enviado al servidor:', message);
    messageInput.value = ''; // Limpiar el campo de entrada después de enviar
    usernameInput.disabled = true; // Deshabilitar el campo de nombre de usuario después de enviar el primer mensaje
} 

sendButton.addEventListener('click', sendMessage);

socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    const username = data.usuario || 'Anónimo';
    const messageText = data.mensaje; 

    if (data.tipo === 'lista-usuarios') {
        usersList.innerHTML = '';
        data.usuarios.forEach((usuario) => {
            const userElement = document.createElement('li');
            userElement.textContent = usuario;
            const color = getUserColor(usuario);
            userElement.style.borderLeftColor = color;
            usersList.appendChild(userElement);
        });
        return; // No mostrar un mensaje de chat para la actualización de la lista de usuarios
    }

    const messageElement = document.createElement('div');
    const isServerMessage = username === 'Servidor';
    
    if (!isServerMessage) {
        messageElement.classList.add('user-message');
        const userColor = getUserColor(username);
        messageElement.style.setProperty('--user-color', userColor);
        
        // Crear estructura con nombre y mensaje
        const usernameElement = document.createElement('div');
        usernameElement.classList.add('username');
        usernameElement.textContent = username;
        usernameElement.style.color = userColor;
        
        const textElement = document.createElement('div');
        textElement.classList.add('message-text');
        textElement.textContent = messageText;
        
        const timeElement = document.createElement('div');
        timeElement.classList.add('message-time');
        timeElement.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        messageElement.appendChild(usernameElement);
        messageElement.appendChild(textElement);
        messageElement.appendChild(timeElement);
    } else {
        messageElement.classList.add('server-message');
        messageElement.textContent = `* ${messageText} *`;
    }
    
    messages.appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight;
});