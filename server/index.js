require('dotenv').config();

const Websocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Logger = require('./Logger');
const { PORT, ALLOWED_ORIGINS } = require('./config/constants');
const socketHandler = require('./handlers/socketHandler');

// ============================================
// CONFIGURACIÓN SERVIDOR
// ============================================
const logger = new Logger();
const httpServer = http.createServer();

// Crear WebSocket Server
const wss = new Websocket.Server({ server: httpServer });

// Inicializar lógica de WebSockets
socketHandler(wss, logger);

// ============================================
// INIT DEL SERVIDOR
// ============================================
httpServer.listen(PORT, () => {
    logger.log('INFO', 'server_started', 'system', {
        port: PORT,
        correlativosPermitidos: ALLOWED_ORIGINS.length
    });

    console.log(`\n🚀 Servidor WebSocket iniciado`);
    console.log(`🔒 Puerto: ${PORT}`);
    console.log(`📝 Logs en: ${logger.LOG_DIR}`);
    console.log(`\n🌐 Orígenes permitidos (${ALLOWED_ORIGINS.length}):`);
    ALLOWED_ORIGINS.forEach((origin, idx) => {
        console.log(`   ${idx + 1}. ${origin}`);
    });
});

// ============================================
// CIERRE LIMPIO (GRACEFUL SHUTDOWN)
// ============================================
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Recibida señal ${signal}. Apagando servidor...`);
    
    logger.log('INFO', 'server_stopping', 'system', { signal });
    
    // Cerrar el servidor HTTP primero
    httpServer.close(() => {
        console.log('HTTP Server cerrado.');
        
        // Vaciar logs finales de forma síncrona
        logger.flushSync();
        console.log('Logs guardados. Adiós 👋');
        process.exit(0);
    });

    // Forzar cierre si tarda demasiado (5 segundos)
    setTimeout(() => {
        console.error('Forzando cierre por tiempo de espera excedido...');
        logger.flushSync();
        process.exit(1);
    }, 5000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

