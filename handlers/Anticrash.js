

import Logger from '../utils/Logger.js';

class Anticrash {
    constructor() {
        this.initialized = false;
    }

    
    init() {
        if (this.initialized) {
            Logger.warn('Anticrash already initialized');
            return;
        }

        Logger.system('Initializing anticrash protection...');

        
        process.on('uncaughtException', (error) => {
            const timestamp = new Date().toISOString();

            Logger.blank();
            Logger.error('═════════════════════════════════════════════════════════════');
            Logger.error(`🚨 UNCAUGHT EXCEPTION at ${timestamp}`);
            Logger.error('═════════════════════════════════════════════════════════════');
            Logger.error(`💥 Error: ${error.message}`);

            if (error.stack) {
                Logger.error('📋 Stack Trace:');
                const stackLines = error.stack.split('\n').slice(0, 8); 
                stackLines.forEach((line, index) => {
                    if (line.trim()) {
                        Logger.error(`   ${index}: ${line.trim()}`);
                    }
                });
            } else {
                Logger.error('❌ No stack trace available');
            }

            Logger.error('═════════════════════════════════════════════════════════════');
            Logger.blank();

            
            this.logErrorToFile(error, 'uncaughtException');

            
            Logger.warn('🚨 Process stability compromised - continuing with caution...');
        });

        
        process.on('unhandledRejection', (reason, promise) => {
            const timestamp = new Date().toISOString();

            Logger.blank();
            Logger.error('═════════════════════════════════════════════════════════════');
            Logger.error(`🚨 UNHANDLED PROMISE REJECTION at ${timestamp}`);
            Logger.error('═════════════════════════════════════════════════════════════');

            if (reason instanceof Error) {
                Logger.error(`💥 Reason: ${reason.message}`);

                if (reason.stack) {
                    Logger.error('📋 Stack Trace:');
                    const stackLines = reason.stack.split('\n').slice(0, 5); 
                    stackLines.forEach((line, index) => {
                        if (line.trim()) {
                            Logger.error(`   ${index}: ${line.trim()}`);
                        }
                    });
                }
            } else {
                Logger.error(`💥 Reason: ${String(reason)}`);
            }

            Logger.error('📦 Promise object logged to debug');
            if (Logger.debug) {
                Logger.debug(`Promise: ${promise}`);
            }

            Logger.error('═════════════════════════════════════════════════════════════');
            Logger.blank();

            
            this.logRejectionToFile(reason, promise, 'unhandledRejection');
        });

        
        process.on('warning', (warning) => {
            
            if (warning.name === 'ExperimentalWarning' ||
                warning.name === 'DeprecationWarning') {
                Logger.debug(`⚠️  ${warning.name}: ${warning.message}`);
            } else {
                Logger.warn(`⚠️  ${warning.name}: ${warning.message}`);

                
                if (warning.stack && warning.name !== 'ExperimentalWarning') {
                    const firstLine = warning.stack.split('\n')[1];
                    if (firstLine) {
                        Logger.warn(`   at ${firstLine.trim()}`);
                    }
                }
            }
        });

        
        process.on('SIGINT', () => {
            Logger.system('🛑 Received SIGINT (Ctrl+C) - initiating graceful shutdown...');
            this.gracefulShutdown('SIGINT');
        });

        process.on('SIGTERM', () => {
            Logger.system('🛑 Received SIGTERM - initiating graceful shutdown...');
            this.gracefulShutdown('SIGTERM');
        });

        process.on('SIGHUP', () => {
            Logger.system('🛑 Received SIGHUP - initiating graceful shutdown...');
            this.gracefulShutdown('SIGHUP');
        });

        this.initialized = true;
        Logger.success('✅ Anticrash protection system initialized');
    }

    
    async logErrorToFile(error, type) {
        try {
            
            const fs = await import('fs');
            const path = await import('path');
            const logEntry = `[${new Date().toISOString()}] [${type}] ${error.message}\n`;

            
            fs.appendFileSync('crash.log', logEntry);
        } catch (fileError) {
            Logger.error(`Failed to log error to file: ${fileError.message}`);
        }
    }

    
    async logRejectionToFile(reason, promise, type) {
        try {
            const fs = await import('fs');
            const logEntry = `[${new Date().toISOString()}] [${type}] ${String(reason)}\n`;
            fs.appendFileSync('crash.log', logEntry);
        } catch (fileError) {
            Logger.error(`Failed to log rejection to file: ${fileError.message}`);
        }
    }

    
    async gracefulShutdown(signal) {
        try {
            Logger.system(`Initiating graceful shutdown due to ${signal}...`);

            
            Logger.system('Cleaning up resources...');

            await new Promise(resolve => setTimeout(resolve, 1000));

            Logger.success('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            Logger.error(`Error during graceful shutdown: ${error.message}`);
            process.exit(1);
        }
    }

    
    isInitialized() {
        return this.initialized;
    }
}

export default new Anticrash();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */