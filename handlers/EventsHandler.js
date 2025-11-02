

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import terminal from 'terminal-kit';
import Logger from '../utils/Logger.js';

const { terminal: term } = terminal;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EventsHandler {
    constructor() {
        this.events = new Map();
        this.eventCount = 0;
        this.folders = ['client', 'security'];
    }

    
    async loadEvents(client) {
        Logger.system('🔧 Loading event handlers...');

        const eventsDir = path.join(__dirname, '../events');

        
        if (!fs.existsSync(eventsDir)) {
            Logger.warn('Events directory not found');
            return;
        }

        let totalFiles = 0;

        
        for (const folder of this.folders) {
            const folderPath = path.join(eventsDir, folder);
            if (!fs.existsSync(folderPath)) {
                Logger.warn(`Events folder '${folder}' not found`);
                continue;
            }

            const files = fs.readdirSync(folderPath).filter(file =>
                file.endsWith('.js') && !file.startsWith('.')
            );
            totalFiles += files.length;
        }

        if (totalFiles === 0) {
            Logger.warn('No event files found');
            return;
        }

        Logger.info(`Found ${totalFiles} event files across ${this.folders.length} categories`);

        
        const progressBar = term.progressBar({
            width: 50,
            title: 'Loading Events:',
            eta: true,
            percent: true,
            inline: false
        });

        let loadedCount = 0;

        
        term.eraseDisplayBelow();

        
        for (const folder of this.folders) {
            const folderPath = path.join(eventsDir, folder);

            if (!fs.existsSync(folderPath)) continue;

            const files = fs.readdirSync(folderPath).filter(file =>
                file.endsWith('.js') && !file.startsWith('.')
            );

            if (files.length === 0) continue;

            Logger.system(`📁 Loading ${files.length} events from '${folder}' category`);

            
            files.sort();

            for (const file of files) {
                try {
                    const filePath = path.join(folderPath, file);
                    const { default: eventModule } = await import(`file://${filePath}`);

                    
                    if (!eventModule || typeof eventModule !== 'object') {
                        Logger.warn(`Invalid event structure in ${file} - skipping`);
                        continue;
                    }

                    if (!eventModule.name || !eventModule.execute) {
                        Logger.error(`Missing 'name' or 'execute' property in ${file}`);
                        continue;
                    }

                    const eventName = eventModule.name;
                    const useOnce = eventModule.once || false;

                    
                    if (useOnce) {
                        client.once(eventName, (...args) => eventModule.execute(client, ...args));
                    } else {
                        client.on(eventName, (...args) => eventModule.execute(client, ...args));
                    }

                    
                    this.events.set(eventName, {
                        file,
                        folder,
                        once: useOnce,
                        path: filePath
                    });

                    this.eventCount++;
                    loadedCount++;

                    
                    progressBar.update({
                        progress: loadedCount / totalFiles,
                        title: `Loading Events: [${folder}/${file}]`
                    });

                } catch (error) {
                    Logger.error(`Failed to load event ${file}: ${error.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        
        progressBar.update({
            progress: 1,
            title: 'Loading Events: Complete!'
        });

        
        await new Promise(resolve => setTimeout(resolve, 500));
        term.eraseDisplayBelow();

        Logger.success(`✅ Successfully loaded ${this.eventCount} event handlers!`);

        
        const categoryStats = {};
        for (const [eventName, eventInfo] of this.events) {
            categoryStats[eventInfo.folder] = (categoryStats[eventInfo.folder] || 0) + 1;
        }

        console.log(''); 
        Logger.system('📊 Event Loading Summary:');
        Logger.system('═══════════════════════════════════════');

        for (const [category, count] of Object.entries(categoryStats)) {
            Logger.info(`  ${category.charAt(0).toUpperCase() + category.slice(1)}: ${count} events`);
        }

        Logger.system('═══════════════════════════════════════');
        console.log(''); 

        Logger.success('🚀 Event system ready! All handlers registered.');
    }

    
    getStats() {
        return {
            total: this.eventCount,
            categories: [...new Set([...this.events.values()].map(e => e.folder))],
            events: Object.fromEntries(this.events)
        };
    }

    
    hasEvent(eventName) {
        return this.events.has(eventName);
    }

    
    getEvent(eventName) {
        return this.events.get(eventName) || null;
    }
}

export default new EventsHandler();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */