const Websocket = require('ws');

const wss = new Websocket.Server({ port: 8080 });

function enviarListaUsuarios() {
    const usuariosConectados = Array.from(wss.clients)
        .filter(client => client.usuarioIdentificado)
        .map(client => client.nombreUsuario);   
    broadcastMessage({ tipo: 'lista-usuarios', usuarios: usuariosConectados });
}

function broadcastMessage(obj) {
    const data = JSON.stringify(obj);
    wss.clients.forEach((client) => {
        if (client.readyState === Websocket.OPEN) {     
            client.send(data);
        }   
    });
}

wss.on('connection', (ws) => {
    //broadcastMessage({ usuario: 'Servidor', mensaje: 'Un nuevo cliente se ha conectado' });    
    ws.usuarioIdentificado = false; // Agregar propiedad para identificar si el usuario ha enviado su nombre

    ws.on('message', (message) => {
        const messageData = JSON.parse(message.toString());

        if (!ws.usuarioIdentificado) {
            ws.nombreUsuario = messageData.usuario; // Guardar el nombre de usuario en la conexión WebSocket
            ws.usuarioIdentificado = true; // Marcar al usuario como identificado
            broadcastMessage({ usuario: 'Servidor', mensaje: `El usuario "${messageData.usuario}" se ha conectado` });
            enviarListaUsuarios(); // Enviar la lista actualizada de usuarios conectados
        }

        broadcastMessage(messageData);
    });

    ws.on('close', () => {
        if (ws.usuarioIdentificado) {
            broadcastMessage({ usuario: 'Servidor', mensaje: `El usuario "${ws.nombreUsuario}" se ha desconectado` });
            enviarListaUsuarios(); // Enviar la lista actualizada de usuarios conectados
        }
    });
}); 

console.log('Servidor WebSocket escuchando en el puerto 8080');