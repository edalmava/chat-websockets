const fs = require('fs');
const path = require('path');

/**
 * ============================================
 * SISTEMA DE LOGGING PROFESIONAL
 * Auditoría persistente a archivos JSON
 * ============================================
 */

class Logger {
    constructor() {
        // Niveles de log con códigos
        this.LEVELS = {
            DEBUG: { code: 10, name: 'DEBUG' },
            INFO: { code: 20, name: 'INFO' },
            WARNING: { code: 30, name: 'WARNING' },
            ERROR: { code: 40, name: 'ERROR' }
        };

        // Configuración
        this.MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB en bytes
        this.RETENTION_DAYS = 30;
        this.LOG_DIR = this._getLogDirectory();

        // Asegurar que el directorio de logs existe
        this._ensureLogDirectory();

        // Path del archivo actual
        this.currentLogFile = this._getLogPath();

        // Contadores de seguridad
        this.eventCounters = {
            corsRejections: 0,
            rateLimitViolations: 0,
            validationErrors: 0,
            errorCount: 0,
            totalEvents: 0
        };

        // Iniciar limpieza automática (cada 24 horas)
        this._setupAutoCleanup();

        // Inicia resumen de seguridad periódico (cada 30 segundos)
        this._setupSecuritySummary();

        // Escribir evento de inicio
        this.log('INFO', 'logger_initialized', 'system', {
            logDirectory: this.LOG_DIR,
            maxFileSize: `${(this.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
            retentionDays: this.RETENTION_DAYS
        });
    }

    /**
     * Método principal para loguear eventos
     * @param {string} nivel - DEBUG, INFO, WARNING, ERROR
     * @param {string} evento - Nombre del evento (ej: user_connected)
     * @param {string} clientId - Cliente afectado (o 'system' para eventos del sistema)
     * @param {object} detalles - Información adicional del evento
     */
    log(nivel, evento, clientId, detalles = {}) {
        try {
            // Validar nivel
            if (!this.LEVELS[nivel]) {
                console.error(`❌ Nivel de log inválido: ${nivel}`);
                return;
            }

            // Actualizar contadores
            this.eventCounters.totalEvents++;
            this._updateCounters(evento);

            // Crear objeto de evento
            const eventObj = {
                timestamp: new Date().toISOString(),
                nivel: nivel,
                evento: evento,
                clientId: clientId,
                detalles: detalles
            };

            // Verificar si necesita rotación
            this._checkRotation();

            // Escribir a archivo
            this._writeToFile(eventObj);

        } catch (error) {
            console.error(`❌ Error en Logger: ${error.message}`);
        }
    }

    /**
     * Retorna resumen de alertas de seguridad
     */
    getSecurityAlerts() {
        return {
            corsRejections: this.eventCounters.corsRejections,
            rateLimitViolations: this.eventCounters.rateLimitViolations,
            validationErrors: this.eventCounters.validationErrors,
            errorCount: this.eventCounters.errorCount,
            totalEvents: this.eventCounters.totalEvents
        };
    }

    /**
     * Resetea contadores (útil después de enviarlo a analytics)
     */
    resetCounters() {
        this.eventCounters = {
            corsRejections: 0,
            rateLimitViolations: 0,
            validationErrors: 0,
            errorCount: 0,
            totalEvents: 0
        };
    }

    // ============================================
    // MÉTODOS PRIVADOS
    // ============================================

    /**
     * Determina el directorio de logs según NODE_ENV
     */
    _getLogDirectory() {
        if (process.env.NODE_ENV === 'production') {
            return '/var/log/websockets';
        }
        return path.join(__dirname, '../logs');
    }

    /**
     * Asegura que el directorio de logs existe
     */
    _ensureLogDirectory() {
        if (!fs.existsSync(this.LOG_DIR)) {
            fs.mkdirSync(this.LOG_DIR, { recursive: true });
        }
    }

    /**
     * Obtiene la ruta del archivo de log actual (YYYY-MM-DD.log)
     */
    _getLogPath() {
        const today = this._formatDate(new Date());
        return path.join(this.LOG_DIR, `${today}.log`);
    }

    /**
     * Formatea fecha como YYYY-MM-DD
     */
    _formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Formatea timestamp como YYYY-MM-DD_HH-MM-SS
     */
    _formatTimestamp(date) {
        const datePart = this._formatDate(date);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${datePart}_${hours}-${minutes}-${seconds}`;
    }

    /**
     * Verifica si el archivo actual necesita rotación
     * Ocurre si:
     * 1. Cambió el día (nuevo archivo YYYY-MM-DD.log)
     * 2. Archivo actual > 10MB (rotar a YYYY-MM-DD_HH-MM-SS_001.log)
     */
    _checkRotation() {
        const newLogPath = this._getLogPath();

        // Si cambió el día, actualizar path
        if (newLogPath !== this.currentLogFile) {
            this.currentLogFile = newLogPath;
            return;
        }

        // Verificar tamaño del archivo
        if (!fs.existsSync(this.currentLogFile)) {
            return;
        }

        try {
            const stats = fs.statSync(this.currentLogFile);
            if (stats.size > this.MAX_FILE_SIZE) {
                this._rotateLogFile();
            }
        } catch (error) {
            console.error(`⚠️ Error verificando tamaño de log: ${error.message}`);
        }
    }

    /**
     * Rota el archivo actual a nombre con timestamp
     * Formato: logs/YYYY-MM-DD_HH-MM-SS_001.log
     */
    _rotateLogFile() {
        try {
            const timestamp = this._formatTimestamp(new Date());
            const rotatedName = path.join(
                this.LOG_DIR,
                `${timestamp}_001.log`
            );

            // Renombrar archivo actual
            if (fs.existsSync(this.currentLogFile)) {
                let finalPath = rotatedName;
                let counter = 1;

                // Si el archivo con timestamp ya existe, agregar sufijo numérico
                while (fs.existsSync(finalPath)) {
                    counter++;
                    const basePath = path.dirname(rotatedName);
                    const basename = path.basename(rotatedName, '.log');
                    finalPath = path.join(basePath, `${basename.replace(/_001$/, `_${String(counter).padStart(3, '0')}`)}.log`);
                }

                fs.renameSync(this.currentLogFile, finalPath);
            }

            // Loguear rotación
            this.log('INFO', 'log_rotation', 'system', {
                rotatedFile: path.basename(rotatedName),
                reason: 'file_size_exceeded',
                maxSize: `${(this.MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`
            });

        } catch (error) {
            console.error(`❌ Error rotando archivo de log: ${error.message}`);
        }
    }

    /**
     * Escribe evento a archivo de log
     */
    _writeToFile(eventObj) {
        try {
            const jsonLine = JSON.stringify(eventObj);
            fs.appendFileSync(this.currentLogFile, jsonLine + '\n');
        } catch (error) {
            console.error(`❌ Error escribiendo a log: ${error.message}`);
        }
    }

    /**
     * Actualiza contadores de seguridad según el tipo de evento
     */
    _updateCounters(evento) {
        switch (evento) {
            case 'cors_rejected':
                this.eventCounters.corsRejections++;
                break;
            case 'rate_limit_exceeded':
                this.eventCounters.rateLimitViolations++;
                break;
            case 'user_validation_failed':
            case 'message_validation_failed':
            case 'invalid_json':
                this.eventCounters.validationErrors++;
                break;
            case 'message_processing_error':
                this.eventCounters.errorCount++;
                break;
        }
    }

    /**
     * Configura limpieza automática de logs antiguos (cada 24 horas)
     */
    _setupAutoCleanup() {
        // Ejecutar limpeza cada 24 horas
        setInterval(() => {
            this.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000);

        // También ejecutar al iniciar (después de 5 segundos)
        setTimeout(() => {
            this.cleanupOldLogs();
        }, 5000);
    }

    /**
     * Limpia logs más antiguos que RETENTION_DAYS
     */
    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.LOG_DIR);
            const now = new Date();
            let deletedCount = 0;

            files.forEach(file => {
                const filePath = path.join(this.LOG_DIR, file);
                const stats = fs.statSync(filePath);
                const fileAge = Math.floor((now - stats.mtime) / (1000 * 60 * 60 * 24));

                // Si el archivo tiene más de RETENTION_DAYS de antigüedad
                if (fileAge > this.RETENTION_DAYS) {
                    try {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                    } catch (err) {
                        console.error(`⚠️ No se pudo eliminar ${file}: ${err.message}`);
                    }
                }
            });

            if (deletedCount > 0) {
                this.log('INFO', 'log_cleanup', 'system', {
                    deletedFiles: deletedCount,
                    retentionDays: this.RETENTION_DAYS
                });
            }

        } catch (error) {
            console.error(`❌ Error en cleanup de logs: ${error.message}`);
        }
    }

    /**
     * Configura reporte periódico de seguridad (cada 30 segundos)
     */
    _setupSecuritySummary() {
        setInterval(() => {
            const alerts = this.getSecurityAlerts();
            
            // Solo loguear si hay eventos registrados
            if (alerts.totalEvents > 0) {
                this.log('INFO', 'security_summary', 'system', alerts);
            }

            // Resetear contadores para el siguiente período
            this.resetCounters();

        }, 30 * 1000); // Cada 30 segundos
    }

    /**
     * Calcula uptime del servidor en formato legible
     */
    _getUptime() {
        const seconds = Math.floor(process.uptime());
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${minutes}m`;
    }
}

module.exports = Logger;
