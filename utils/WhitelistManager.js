

import Logger from './Logger.js';

class WhitelistManager {
    constructor() {
        this.whitelistedUsers = new Set();
        this.owners = new Set();
        this.loadFromConfig();
    }

    
    loadFromConfig() {
        this.whitelistedUsers.clear();
        this.owners.clear();

        if (!global.config) {
            Logger.warn('WhitelistManager: No global config available');
            return;
        }

        
        if (global.config.whitelisted?.users && Array.isArray(global.config.whitelisted.users)) {
            for (const userId of global.config.whitelisted.users) {
                const cleanId = this.cleanUserId(userId);
                if (cleanId && this.validateUserId(cleanId)) {
                    this.whitelistedUsers.add(cleanId);
                }
            }
        }

        
        if (global.config.selfbot?.owner1_id && global.config.selfbot.owner1_id !== '') {
            const cleanId = this.cleanUserId(global.config.selfbot.owner1_id);
            if (cleanId && this.validateUserId(cleanId)) {
                this.owners.add(cleanId);
                this.whitelistedUsers.add(cleanId);
            }
        }

        if (global.config.selfbot?.owner2_id && global.config.selfbot.owner2_id !== '') {
            const cleanId = this.cleanUserId(global.config.selfbot.owner2_id);
            if (cleanId && this.validateUserId(cleanId)) {
                this.owners.add(cleanId);
                this.whitelistedUsers.add(cleanId);
            }
        }

        Logger.debug(`Loaded ${this.whitelistedUsers.size} whitelisted users (${this.owners.size} owners)`);
    }

    
    isWhitelisted(userId) {
        if (!userId) return false;
        const cleanId = this.cleanUserId(userId);
        return this.whitelistedUsers.has(cleanId);
    }

    
    isOwner(userId) {
        if (!userId) return false;
        const cleanId = this.cleanUserId(userId);
        return this.owners.has(cleanId);
    }

    
    shouldBypass(userId) {
        return this.isOwner(userId) || this.isWhitelisted(userId);
    }

    
    getAllWhitelisted() {
        return Array.from(this.whitelistedUsers);
    }

    
    getAllOwners() {
        return Array.from(this.owners);
    }

    
    cleanUserId(userId) {
        if (!userId) return '';
        return userId.toString().replace(/["\s]/g, '');
    }

    
    validateUserId(userId) {
        return /^\d{17,20}$/.test(userId);
    }

    
    reload() {
        Logger.debug('Reloading whitelist from config');
        this.loadFromConfig();
    }
}

const whitelistManager = new WhitelistManager();
export default whitelistManager;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */