/**
 * GESTOR DE LA INTERFAZ DE USUARIO (UI)
 */

// Paleta de colores para usuarios
const userColors = {};
const colorPalette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#a855f7'
];
let colorIndex = 0;

function getUserColor(username) {
    if (!userColors[username]) {
        userColors[username] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
    }
    return userColors[username];
}

function sanitizeHtml(text) {
    if (typeof text !== 'string') return '';
    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => htmlEscapeMap[char]);
}

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
const roomsList = document.getElementById('rooms');
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
const adminChangeRoleButton = document.getElementById('adminChangeRoleButton');

// Banner de estado de conexión
const statusBanner = document.createElement('div');
statusBanner.id = 'connection-status';
statusBanner.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 16px;border-radius:20px;font-size:13px;z-index:1000;display:none;';
document.body.appendChild(statusBanner);

// Variables locales del UI
let estaEscribiendo = false;
let typingTimeout = null;
let p2pEstaEscribiendo = false;
let p2pTypingTimeout = null;

/**
 * #7: Muestra una notificación persistente en el contenedor de notificaciones
 */
export function mostrarNotificacion(mensaje, tipo = 'info', duracion = 8000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.style.borderLeftColor = tipo === 'error' ? '#ef4444' : (tipo === 'warning' ? '#f59e0b' : '#3b82f6');
    toast.innerHTML = `<div class="toast-content">${mensaje}</div>`;
    
    const container = document.getElementById('notifications-container');
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duracion);
}

/**
 * Inicializa y asocia los listeners del DOM con los callbacks del orquestador.
 */
export function inicializarUI(callbacks = {}) {
    // Pestañas Auth
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    if (tabLogin) tabLogin.onclick = () => cambiarPestañaAuth('login');
    if (tabRegister) tabRegister.onclick = () => cambiarPestañaAuth('register');

    // Forms Submits
    if (loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            if (callbacks.onLoginSubmit) callbacks.onLoginSubmit(email, password);
        };
    }

    if (registerForm) {
        registerForm.onsubmit = (e) => {
            e.preventDefault();
            const displayName = document.getElementById('register-displayname').value.trim();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('register-confirm').value;
            
            if (password !== confirm) {
                mostrarErrorAuth('Las contraseñas no coinciden');
                return;
            }
            if (callbacks.onRegisterSubmit) callbacks.onRegisterSubmit(displayName, email, password);
        };
    }

    // Botón logout
    if (logoutButton) {
        logoutButton.onclick = () => {
            if (callbacks.onLogout) callbacks.onLogout();
        };
    }

    // Enviar mensaje público
    const enviarMensajePublicoSubmit = () => {
        const texto = messageInput.value.trim();
        if (texto && callbacks.onPublicMessageSend) {
            callbacks.onPublicMessageSend(texto);
            messageInput.value = '';
            
            if (estaEscribiendo) {
                estaEscribiendo = false;
                if (callbacks.onPublicTyping) callbacks.onPublicTyping(false);
            }
        }
    };

    if (sendButton) sendButton.onclick = enviarMensajePublicoSubmit;
    if (messageInput) {
        messageInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                enviarMensajePublicoSubmit();
            } else {
                // Controlar "Está escribiendo..."
                if (!estaEscribiendo) {
                    estaEscribiendo = true;
                    if (callbacks.onPublicTyping) callbacks.onPublicTyping(true);
                }
                if (typingTimeout) clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    estaEscribiendo = false;
                    if (callbacks.onPublicTyping) callbacks.onPublicTyping(false);
                }, 3000);
            }
        };
    }

    // Enviar mensaje P2P privado
    const enviarMensajePrivadoSubmit = () => {
        const texto = p2pMessageInput.value.trim();
        if (texto && callbacks.onP2PMessageSend) {
            callbacks.onP2PMessageSend(texto);
            p2pMessageInput.value = '';
            
            if (p2pEstaEscribiendo) {
                p2pEstaEscribiendo = false;
                if (callbacks.onP2PTyping) callbacks.onP2PTyping(false);
            }
        }
    };

    if (p2pSendButton) p2pSendButton.onclick = enviarMensajePrivadoSubmit;
    if (p2pMessageInput) {
        p2pMessageInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                enviarMensajePrivadoSubmit();
            } else {
                if (!p2pEstaEscribiendo) {
                    p2pEstaEscribiendo = true;
                    if (callbacks.onP2PTyping) callbacks.onP2PTyping(true);
                }
                if (p2pTypingTimeout) clearTimeout(p2pTypingTimeout);
                p2pTypingTimeout = setTimeout(() => {
                    p2pEstaEscribiendo = false;
                    if (callbacks.onP2PTyping) callbacks.onP2PTyping(false);
                }, 3000);
            }
        };
    }

    // Cerrar Modal P2P
    if (closeP2PButton) {
        closeP2PButton.onclick = () => {
            p2pModal.classList.add('hidden');
            if (callbacks.onP2PClose) callbacks.onP2PClose();
        };
    }

    // #8: Control de Rol Admin via event listener (sin exponer en window)
    if (adminChangeRoleButton) {
        adminChangeRoleButton.onclick = () => {
            const targetUserId = adminUserSelect.value;
            const nuevoRol = adminRoleSelect.value;
            if (!targetUserId) {
                mostrarNotificacion('Por favor selecciona un usuario', 'warning', 3000);
                return;
            }
            if (callbacks.onAdminChangeRole) {
                callbacks.onAdminChangeRole(targetUserId, nuevoRol);
            }
        };
    }
}

/**
 * Conmuta entre pestañas de Login y Registro
 */
export function cambiarPestañaAuth(pestaña) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    authError.classList.add('hidden');
    
    if (pestaña === 'login') {
        if (tabLogin) tabLogin.classList.add('active');
        if (tabRegister) tabRegister.classList.remove('active');
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
    } else {
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabRegister) tabRegister.classList.add('active');
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
    }
}

/**
 * Muestra error de autenticación en la UI
 */
export function mostrarErrorAuth(mensaje) {
    authError.textContent = mensaje;
    authError.classList.remove('hidden');
}

/**
 * Muestra u oculta el spinner de carga de autenticación
 */
export function mostrarCargandoAuth(cargando) {
    if (cargando) {
        authLoading.classList.remove('hidden');
    } else {
        authLoading.classList.add('hidden');
    }
}

/**
 * Muestra la pantalla de Login y oculta el Chat
 */
export function mostrarPantallaLogin() {
    loginContainer.classList.remove('hidden');
    chatContainer.classList.add('hidden');
    userIdentity.classList.add('hidden');
    mostrarCargandoAuth(false);
}

/**
 * Muestra la pantalla de Chat y oculta el Login
 */
export function mostrarPantallaChat() {
    loginContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    userIdentity.classList.remove('hidden');
}

/**
 * Actualiza la información del usuario autenticado actual en el banner superior
 */
export function actualizarInfoUsuario(displayName, role, miUserId) {
    currentUsernameSpan.textContent = displayName;
    currentUserRoleSpan.textContent = role;
    currentUserRoleSpan.className = `role-badge role-${role}`;

    // Mostrar/ocultar el panel de administración si es admin
    if (role === 'admin') {
        adminPanel.classList.remove('hidden');
    } else {
        adminPanel.classList.add('hidden');
    }
}

/**
 * Actualiza el banner de estado de conexión en la esquina inferior derecha
 */
export function actualizarStatusUI(mensaje, tipo = 'info') {
    statusBanner.textContent = mensaje;
    statusBanner.style.display = 'block';
    statusBanner.style.backgroundColor = tipo === 'success' ? '#dcfce7' : (tipo === 'error' ? '#fee2e2' : '#dbeafe');
    statusBanner.style.color = '#1f2937';
    if (tipo === 'success') {
        setTimeout(() => {
            statusBanner.style.display = 'none';
        }, 3000);
    }
}

/**
 * Limpia la caja de mensajes públicos
 */
export function limpiarMensajesPublicos() {
    messages.innerHTML = '';
}

/**
 * Renderiza salas en la barra lateral
 */
export function renderizarSalas(salas, salaActual, onRoomClick) {
    roomsList.innerHTML = '';
    salas.forEach(sala => {
        const li = document.createElement('li');
        li.textContent = sala;
        if (sala === salaActual) {
            li.classList.add('active');
        }
        li.onclick = () => {
            if (onRoomClick) onRoomClick(sala);
        };
        roomsList.appendChild(li);
    });
}

/**
 * Actualiza la sala activa visualmente en la lista lateral
 */
export function actualizarSalaActiva(salaActual) {
    const salasItems = roomsList.querySelectorAll('li');
    salasItems.forEach(li => {
        if (li.textContent === salaActual) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });
}

/**
 * Muestra un modal con un campo de texto, reemplazando prompt()
 * @param {string} titulo - Título del modal
 * @param {string} placeholder - Texto placeholder del input
 * @param {string} valorDefecto - Valor inicial del input
 * @param {string} textoBoton - Texto del botón de confirmación
 * @returns {Promise<string|null>} Texto ingresado o null si cancela
 */
export function mostrarModalInput(titulo, placeholder = '', valorDefecto = '', textoBoton = 'Aceptar') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.5);display:flex;align-items:center;
            justify-content:center;z-index:2000;
        `;

        const box = document.createElement('div');
        box.className = 'modal-input-box';
        box.style.cssText = `
            background:#fff;border-radius:12px;padding:24px;min-width:320px;
            max-width:440px;box-shadow:0 8px 32px rgba(0,0,0,0.2);
        `;
        box.innerHTML = `
            <h3 style="margin:0 0 16px;font-size:16px;color:#1f2937;">${sanitizeHtml(titulo)}</h3>
            <input type="text" class="modal-input" value="${sanitizeHtml(valorDefecto)}"
                placeholder="${sanitizeHtml(placeholder)}"
                style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;
                    font-size:14px;box-sizing:border-box;margin-bottom:16px;">
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="modal-btn-cancel" style="padding:8px 16px;border:1px solid #d1d5db;
                    border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">Cancelar</button>
                <button class="modal-btn-confirm" style="padding:8px 16px;border:none;
                    border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px;
                    font-weight:600;">${sanitizeHtml(textoBoton)}</button>
            </div>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const input = box.querySelector('.modal-input');
        const btnConfirm = box.querySelector('.modal-btn-confirm');
        const btnCancel = box.querySelector('.modal-btn-cancel');

        function cerrar(valor) {
            overlay.remove();
            resolve(valor);
        }

        btnConfirm.onclick = () => {
            const val = input.value.trim();
            cerrar(val || null);
        };

        btnCancel.onclick = () => cerrar(null);

        overlay.onclick = (e) => {
            if (e.target === overlay) cerrar(null);
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') btnConfirm.click();
            if (e.key === 'Escape') btnCancel.click();
        };

        input.focus();
        input.select();
    });
}

/**
 * Renderiza la lista de usuarios conectados en la sala actual
 */
export function actualizarListaUsuarios(usuarios, miUserId, miRol, callbacks = {}) {
    usersList.innerHTML = '';
    adminUserSelect.innerHTML = '<option value="">Selecciona usuario...</option>';

    const soyModeradorOAdmin = miRol === 'moderator' || miRol === 'admin';

    usuarios.forEach((usuario) => {
        if (usuario.userId === miUserId) return;

        const li = document.createElement('li');
        li.style.borderLeftColor = getUserColor(usuario.displayName);
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        
        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<strong>${sanitizeHtml(usuario.displayName)}</strong> <span class="role-badge role-${usuario.role}" style="font-size:10px;padding:2px 6px;margin-left:6px">${usuario.role}</span>`;
        textSpan.style.cursor = 'pointer';
        textSpan.onclick = () => {
            if (callbacks.onUserClick) callbacks.onUserClick(usuario.userId, usuario.displayName);
        };
        li.appendChild(textSpan);

        // Controles de moderación para moderadores y administradores
        if (soyModeradorOAdmin && usuario.role !== 'admin' && !(miRol === 'moderator' && usuario.role === 'moderator')) {
            const modControls = document.createElement('div');
            modControls.className = 'mod-user-controls';
            
            const kickBtn = document.createElement('button');
            kickBtn.textContent = 'Expulsar';
            kickBtn.className = 'btn-mod-action btn-kick';
            kickBtn.onclick = async (e) => {
                e.stopPropagation();
                const motivo = await mostrarModalInput(
                    `Expulsar a ${usuario.displayName}`,
                    'Motivo de la expulsión',
                    'Infracción de las reglas',
                    'Expulsar'
                );
                if (motivo && callbacks.onKickUser) {
                    callbacks.onKickUser(usuario.userId, motivo);
                }
            };
            modControls.appendChild(kickBtn);

            const muteBtn = document.createElement('button');
            muteBtn.textContent = 'Mute';
            muteBtn.className = 'btn-mod-action btn-mute';
            muteBtn.onclick = async (e) => {
                e.stopPropagation();
                const input = await mostrarModalInput(
                    `Silenciar a ${usuario.displayName}`,
                    'Duración en segundos (máx 3600)',
                    '60',
                    'Silenciar'
                );
                if (input) {
                    const num = parseInt(input, 10);
                    if (!isNaN(num) && num > 0 && num <= 3600) {
                        if (callbacks.onMuteUser) callbacks.onMuteUser(usuario.userId, num);
                    } else {
                        mostrarNotificacion('Ingresa un número entre 1 y 3600', 'warning', 3000);
                    }
                }
            };
            modControls.appendChild(muteBtn);

            li.appendChild(modControls);
        }

        usersList.appendChild(li);

        // Añadir a select de admin
        if (miRol === 'admin') {
            const option = document.createElement('option');
            option.value = usuario.userId;
            option.textContent = `${usuario.displayName} (${usuario.role})`;
            adminUserSelect.appendChild(option);
        }
    });
}

/**
 * Deshabilita la caja de texto del chat público temporalmente por Mute
 */
export function deshabilitarInputChat(duracion) {
    messageInput.disabled = true;
    sendButton.disabled = true;
    messageInput.placeholder = `Silenciado temporalmente por ${duracion}s...`;

    let restante = duracion;
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

/**
 * Renderiza el indicador de "Está escribiendo..." para el canal público
 */
export function actualizarIndicadorEscritura(usuariosEscribiendo) {
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

/**
 * Renderiza un mensaje en la ventana pública de chat
 */
export function renderizarMensajePublico(data) {
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

/**
 * Renderiza la lista lateral de chats P2P activos
 */
export function actualizarSidebarP2P(p2pConnections, activeP2PUser, callbacks = {}) {
    p2pActiveList.innerHTML = '';
    if (p2pConnections.size > 0) {
        p2pListSection.classList.remove('hidden');
    } else {
        p2pListSection.classList.add('hidden');
    }

    p2pConnections.forEach((conn, targetUserId) => {
        const li = document.createElement('li');
        if (targetUserId === activeP2PUser) {
            li.classList.add('active'); // Destacar canal activo
        }
        li.innerHTML = `<span>${sanitizeHtml(conn.displayName)}</span> ${conn.unread > 0 ? `<span class="unread-badge">${conn.unread}</span>` : ''}`;
        li.onclick = () => {
            if (callbacks.onP2PChannelClick) callbacks.onP2PChannelClick(targetUserId);
        };
        p2pActiveList.appendChild(li);
    });
}

/**
 * Conmuta y abre la ventana modal del chat privado P2P
 */
export function renderizarVentanaP2P(targetUserId, conn) {
    p2pModal.classList.remove('hidden');
    p2pTargetNameSpan.textContent = conn.displayName;
    p2pMessagesContainer.innerHTML = '';
    
    // Volcar historial de mensajes P2P
    conn.messages.forEach(m => {
        mostrarMensajeEnVentana(m.de, m.texto, m.de === 'Tú' ? 'me' : 'them', m.time);
    });

    actualizarP2PUI(targetUserId, conn);

    p2pMessageInput.disabled = false;
    p2pMessageInput.placeholder = 'Escribe un mensaje privado P2P...';
    p2pSendButton.disabled = false;
    p2pMessageInput.focus();
}

/**
 * Actualiza el indicador de estado (conectando, conectado, escribiendo) de la ventana P2P
 */
export function actualizarP2PUI(targetUserId, conn) {
    const status = conn.status ? conn.status.toLowerCase() : '';
    
    if (conn.typing) {
        p2pStatusSpan.textContent = 'escribiendo...';
        p2pStatusSpan.className = 'status-typing';
    } else {
        p2pStatusSpan.textContent = conn.status || 'Desconocido';
        p2pStatusSpan.className = (status === 'connected' || status === 'open') ? 'status-open' : 'status-connecting';
    }
}

/**
 * Pinta un mensaje en la ventana modal P2P activa
 */
export function mostrarMensajeEnVentana(usuario, texto, clase, timestamp = null) {
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

/**
 * Actualiza visualmente el visto (check doble) en el último mensaje enviado en P2P
 */
export function actualizarVistoP2P() {
    const tiempos = p2pMessagesContainer.querySelectorAll('.p2p-msg-me .p2p-msg-time');
    if (tiempos.length > 0) {
        const ultimoTime = tiempos[tiempos.length - 1];
        if (!ultimoTime.textContent.includes('✓✓')) {
            ultimoTime.textContent += ' ✓✓';
        }
    }
}

/**
 * Muestra el Toast o alerta flotante de invitación a una llamada P2P
 */
export function mostrarToastInvitacion(deUserId, deNombre, senal, onAccept, onReject) {
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

    const btnAccept = document.getElementById(`accept-${deUserId}`);
    const btnReject = document.getElementById(`reject-${deUserId}`);

    if (btnAccept) {
        btnAccept.onclick = () => {
            toast.remove();
            if (onAccept) onAccept(deUserId, senal);
        };
    }
    
    if (btnReject) {
        btnReject.onclick = () => {
            toast.remove();
            if (onReject) onReject(deUserId);
        };
    }
}

/**
 * Cambia los inputs del modal P2P a modo deshabilitado por cierre de canal
 */
export function deshabilitarUIModalP2P(motivo) {
    const div = document.createElement('div');
    div.className = 'p2p-msg p2p-msg-them';
    div.innerHTML = `<div class="p2p-msg-text" style="color:var(--text-muted);font-style:italic">
        ⚠️ ${sanitizeHtml(motivo)}
    </div>`;
    p2pMessagesContainer.appendChild(div);
    p2pMessagesContainer.scrollTop = p2pMessagesContainer.scrollHeight;

    p2pMessageInput.disabled = true;
    p2pMessageInput.placeholder = 'Conexión cerrada';
    p2pSendButton.disabled = true;
}

/**
 * Oculta la ventana modal del P2P
 */
export function ocultarModalP2P() {
    p2pModal.classList.add('hidden');
}
