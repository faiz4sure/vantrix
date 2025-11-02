

import kleur from 'kleur';
import fs from 'fs';
import path from 'path';

class Logger {
    constructor() {
        this.colors = {
            info: kleur.blue,
            error: kleur.red,
            success: kleur.green,
            system: kleur.cyan,
            debug: kleur.magenta,
            warn: kleur.yellow
        };

        this.prefixes = {
            info: kleur.blue('[INFO]'),
            error: kleur.red('[ERROR]'),
            success: kleur.green('[SUCCESS]'),
            system: kleur.cyan('[SYSTEM]'),
            debug: kleur.magenta('[DEBUG]'),
            warn: kleur.yellow('[WARN]')
        };

        
        this.levels = {
            'error': 1,    
            'warning': 2,  
            'success': 2,  
            'info': 3,     
            'system': 3,   
            'debug': 4     
        };

        
        this.fileLoggingEnabled = false;
        this.logFiles = {
            debug: 'debug.txt',
            error: 'errors.txt',
            warn: 'warn.txt'
        };

        
        this.initializeFileLogging();
    }

    
    initializeFileLogging() {
        try {
            const dataDir = 'data';

            
            if (!fs.existsSync(dataDir)) {
                console.log(`📁 Creating data directory: ${dataDir}`);
                fs.mkdirSync(dataDir, { recursive: true });
            }

            
            const requiredFiles = Object.values(this.logFiles);
            let allFilesExist = true;

            for (const file of requiredFiles) {
                const filePath = path.join(dataDir, file);
                if (!fs.existsSync(filePath)) {
                    console.log(`📄 Creating log file: ${filePath}`);
                    fs.writeFileSync(filePath, '', 'utf8');
                    allFilesExist = false;
                }
            }

            
            if (allFilesExist) {
                this.clearLogFiles();
            }

            this.fileLoggingEnabled = true;
            console.log(`✅ File-based logging initialized successfully`);

        } catch (error) {
            console.error(`❌ Failed to initialize file logging: ${error.message}`);
            console.log(`⚠️  Continuing without file logging...`);
            this.fileLoggingEnabled = false;
        }
    }

    
    clearLogFiles() {
        try {
            const dataDir = 'data';

            for (const [logType, fileName] of Object.entries(this.logFiles)) {
                const filePath = path.join(dataDir, fileName);
                if (fs.existsSync(filePath)) {
                    fs.writeFileSync(filePath, '', 'utf8');
                    console.log(`🧹 Cleared ${logType} log file: ${fileName}`);
                }
            }

            console.log(`✅ All log files cleared - fresh logging session started`);

        } catch (error) {
            console.error(`❌ Failed to clear log files: ${error.message}`);
            
        }
    }

    
    writeToFile(level, message) {
        if (!this.fileLoggingEnabled) return;

        try {
            const fileKey = this.logFiles[level];
            if (!fileKey) return; 

            const filePath = path.join('data', fileKey);
            const timestampedMessage = `[${this.getTimestamp()}] ${message}\n`;

            fs.appendFileSync(filePath, timestampedMessage, 'utf8');

        } catch (error) {
            
            
            if (error.code === 'ENOENT') {
                console.log(`⚠️  Log directory not found - disabling file logging`);
                this.fileLoggingEnabled = false;
            }
        }
    }

    
    shouldLog(level) {
        
        if (!global.config) return true;

        const configLevel = global.config.logs?.log_level || 'info';

        
        let currentLevel = this.levels[configLevel];
        if (!currentLevel) currentLevel = this.levels['info'];

        const messageLevel = this.levels[level];

        return messageLevel <= currentLevel;
    }

    
    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').slice(0, -5);
    }

    
    formatMessage(level, message) {
        const useTimestamp = global.config?.logs?.timestamp !== false; 
        let logMessage = '';

        const prefix = this.prefixes[level] || kleur.white('[UNKNOWN]');
        const coloredMessage = this.colors[level] ? this.colors[level](message) : message;

        if (useTimestamp) {
            const timestamp = kleur.gray(`[${this.getTimestamp()}]`);
            logMessage = `${timestamp} ${prefix} ${coloredMessage}`;
        } else {
            logMessage = `${prefix} ${coloredMessage}`;
        }

        return logMessage;
    }

    
    info(message) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message));
        }
    }

    
    error(message) {
        if (this.shouldLog('error')) {
            console.log(this.formatMessage('error', message));
        }

        
        this.writeToFile('error', `[ERROR] ${message}`);
    }

    
    success(message) {
        if (this.shouldLog('success')) {
            console.log(this.formatMessage('success', message));
        }
    }

    
    system(message) {
        if (this.shouldLog('system')) {
            console.log(this.formatMessage('system', message));
        }
    }

    
    debug(message) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message));
        }

        
        this.writeToFile('debug', `[DEBUG] ${message}`);
    }

    
    warn(message) {
        if (this.shouldLog('warning')) {
            console.log(this.formatMessage('warn', message));
        }

        
        this.writeToFile('warn', `[WARN] ${message}`);
    }

    
    raw(message) {
        console.log(message);
    }

    
    blank() {
        console.log('');
    }
}

export default new Logger();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */