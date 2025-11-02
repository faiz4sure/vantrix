
import AntiNukeManager from '../../utils/AntiNukeManager.js';
import Logger from '../../utils/Logger.js';


const originalServersCache = new Map();

export default {
    name: 'guildUpdate',
    once: false, 
    async execute(client, oldGuild, newGuild) {
        
        if (AntiNukeManager.shouldIgnoreEvent(newGuild.id, 'SYSTEM')) {
            return; 
        }

        
        const changes = detectHarmfulServerChanges(oldGuild, newGuild);

        
        if (!changes.hasHarmfulChanges) {
            return; 
        }

        Logger.warn(`🛡️ Server updated in ${newGuild.name}`, 'warning');

        if (changes.changedProperties.length > 0) {
            Logger.warn(`⚠️ Harmful changes detected: ${changes.changedProperties.join(', ')}`, 'warning');
        }

        
        if (!originalServersCache.has(newGuild.id)) {
            originalServersCache.set(newGuild.id, new Map());
        }

        const guildCache = originalServersCache.get(newGuild.id);

        
        if (!guildCache.has('serverData')) {
            const originalData = {
                id: oldGuild.id,
                name: oldGuild.name,
                icon: oldGuild.icon,
                banner: oldGuild.banner,
                splash: oldGuild.splash,
                verificationLevel: oldGuild.verificationLevel,
                explicitContentFilter: oldGuild.explicitContentFilter,
                defaultMessageNotifications: oldGuild.defaultMessageNotifications,
                mfaLevel: oldGuild.mfaLevel, 
                afkChannelId: oldGuild.afkChannelId,
                afkTimeout: oldGuild.afkTimeout,
                systemChannelId: oldGuild.systemChannelId,
                updatedAt: Date.now()
            };
            guildCache.set('serverData', originalData);
            Logger.debug(`📦 [${oldGuild.name}] Stored original server data`, 'debug');
        }

        
        try {
            Logger.debug(`🔍 Attempting audit log fetch for guild ${newGuild.name} (${newGuild.id})`);

            const auditLogs = await newGuild.fetchAuditLogs({
                type: 1, 
                limit: 1
            });

            const updateEntry = auditLogs.entries.find(entry =>
                entry.executor && 
                (Date.now() - entry.createdTimestamp) < 30000 
            );

            if (updateEntry && updateEntry.executor) {
                const executor = updateEntry.executor;
                Logger.warn(`👤 Server updated by: ${executor.tag} (${executor.id})`, 'warning');

                
                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    Logger.debug(`🚫 Ignoring server update by ${executor.tag} (${AntiNukeManager.isBot(executor.id) ? 'BOT' : 'WHITELISTED'})`);

                    
                    const updatedData = {
                        id: newGuild.id,
                        name: newGuild.name,
                        icon: newGuild.icon,
                        banner: newGuild.banner,
                        splash: newGuild.splash,
                        verificationLevel: newGuild.verificationLevel,
                        explicitContentFilter: newGuild.explicitContentFilter,
                        defaultMessageNotifications: newGuild.defaultMessageNotifications,
                        mfaLevel: newGuild.mfaLevel,
                        afkChannelId: newGuild.afkChannelId,
                        afkTimeout: newGuild.afkTimeout,
                        systemChannelId: newGuild.systemChannelId,
                        updatedAt: Date.now()
                    };
                    guildCache.set('serverData', updatedData);
                    return;
                }

                
                const thresholdExceeded = AntiNukeManager.recordAction(
                    'serverUpdates',
                    executor.id,
                    newGuild.id,
                    false 
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 SERVER UPDATE THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    
                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        newGuild.id,
                        `Malicious server modification detected - Changed ${changes.changedProperties.length} harmful settings`
                    );

                    
                    if (executorPunished) {
                        Logger.warn(`🔄 Server restoration enabled - reverting harmful settings`, 'warning');

                        
                        const originalData = guildCache.get('serverData');

                        const restorePromises = [
                            
                            changes.nameChanged ? restoreServerName(newGuild, originalData) : Promise.resolve(true),
                            
                            
                            
                            
                            
                            changes.verificationChanged ? restoreServerVerification(newGuild, originalData) : Promise.resolve(true),
                            
                            changes.explicitFilterChanged ? restoreServerExplicitFilter(newGuild, originalData) : Promise.resolve(true),
                            
                            changes.notificationsChanged ? restoreServerNotifications(newGuild, originalData) : Promise.resolve(true),
                            
                            changes.mfaChanged ? restoreServerMFA(newGuild, originalData) : Promise.resolve(true)
                        ];

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected' || r.value === false).length;

                        Logger.success(`🔄 Server restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        

                    } else {
                        Logger.info(`🔄 Punishment failed - not attempting server restoration`, 'info');

                        
                        AntiNukeManager.cleanupActionData('serverUpdates', executor.id, newGuild.id);
                        Logger.debug(`🗑️ Cleaned up failed punishment data for ${executor.tag}`, 'debug');
                    }

                    
                    if (executorPunished) {
                        
                        AntiNukeManager.cleanupActionData('serverUpdates', executor.id, newGuild.id);
                        Logger.debug(`✅ Punishment successful - cleaned up server action data for ${executor.tag}`, 'debug');
                    }

                    
                    Logger.success(`⚔️ Anti-server modification operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Server settings changed: ${changes.changedProperties.length}`);
                    Logger.success(`Server settings restored: ${executorPunished ? changes.changedProperties.length : 0}`);

                    
                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                
                Logger.warn(`⚠️ Could not identify server updater from audit logs`, 'warning');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for server update: ${error.message}`, 'error');
            Logger.debug(`Error details: ${error.stack}`, 'debug');
        }

        
        const now = Date.now();
        for (const [guildId, guildCache] of originalServersCache.entries()) {
            for (const [key, serverData] of guildCache.entries()) {
                if (serverData.updatedAt && (now - serverData.updatedAt) > 600000) { 
                    guildCache.delete(key);
                    Logger.debug(`🗑️ Cleaned up expired server data for guild ${guildId}`);
                }
            }
            
            if (guildCache.size === 0) {
                originalServersCache.delete(guildId);
                Logger.debug(`🗑️ Removed empty server cache for guild ${guildId}`);
            }
        }
    }
};


function detectHarmfulServerChanges(oldGuild, newGuild) {
    const changes = {
        hasHarmfulChanges: false,
        changedProperties: [],
        nameChanged: false,
        iconChanged: false,
        bannerChanged: false,
        verificationChanged: false,
        explicitFilterChanged: false,
        notificationsChanged: false,
        mfaChanged: false
    };

    
    if (oldGuild.name !== newGuild.name) {
        changes.nameChanged = true;
        changes.changedProperties.push('name');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.icon !== newGuild.icon) {
        changes.iconChanged = true;
        changes.changedProperties.push('icon');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.banner !== newGuild.banner) {
        changes.bannerChanged = true;
        changes.changedProperties.push('banner');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.verificationChanged = true;
        changes.changedProperties.push('verification_level');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        changes.explicitFilterChanged = true;
        changes.changedProperties.push('explicit_content_filter');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
        changes.notificationsChanged = true;
        changes.changedProperties.push('default_notifications');
        changes.hasHarmfulChanges = true;
    }

    
    if (oldGuild.mfaLevel !== newGuild.mfaLevel) {
        changes.mfaChanged = true;
        changes.changedProperties.push('mfa_level');
        changes.hasHarmfulChanges = true;
    }

    return changes;
}


async function restoreServerName(guild, originalData) {
    try {
        await guild.edit({
            name: originalData.name,
            reason: '[AntiNuke] Restoring original server name'
        });
        Logger.success(`✅ Restored server name: ${guild.name}`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore server name: ${error.message}`);
        return false;
    }
}


async function restoreServerIcon(guild, originalData) {
    try {
        await guild.edit({
            icon: originalData.icon,
            reason: '[AntiNuke] Restoring original server icon'
        });
        Logger.success(`✅ Restored server icon`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore server icon: ${error.message}`);
        return false;
    }
}


async function restoreServerBanner(guild, originalData) {
    try {
        await guild.edit({
            banner: originalData.banner,
            reason: '[AntiNuke] Restoring original server banner'
        });
        Logger.success(`✅ Restored server banner`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore server banner: ${error.message}`);
        return false;
    }
}


async function restoreServerVerification(guild, originalData) {
    try {
        await guild.edit({
            verificationLevel: originalData.verificationLevel,
            reason: '[AntiNuke] Restoring original verification level'
        });
        Logger.success(`✅ Restored verification level: ${originalData.verificationLevel}`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore verification level: ${error.message}`);
        return false;
    }
}


async function restoreServerExplicitFilter(guild, originalData) {
    try {
        await guild.edit({
            explicitContentFilter: originalData.explicitContentFilter,
            reason: '[AntiNuke] Restoring original explicit content filter'
        });
        Logger.success(`✅ Restored explicit content filter: ${originalData.explicitContentFilter}`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore explicit content filter: ${error.message}`);
        return false;
    }
}


async function restoreServerNotifications(guild, originalData) {
    try {
        await guild.edit({
            defaultMessageNotifications: originalData.defaultMessageNotifications,
            reason: '[AntiNuke] Restoring original notification settings'
        });
        Logger.success(`✅ Restored default notifications: ${originalData.defaultMessageNotifications}`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore default notifications: ${error.message}`);
        return false;
    }
}


async function restoreServerMFA(guild, originalData) {
    try {
        await guild.edit({
            mfaLevel: originalData.mfaLevel,
            reason: '[AntiNuke] Restoring original MFA requirements'
        });
        Logger.success(`✅ Restored MFA level: ${originalData.mfaLevel}`);
        return true;
    } catch (error) {
        Logger.error(`Failed to restore MFA level: ${error.message}`);
        return false;
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */