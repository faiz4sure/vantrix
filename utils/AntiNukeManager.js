

import Logger from './Logger.js';
import WhitelistManager from './WhitelistManager.js';
import RateLimitManager from './RateLimitManager.js';

class AntiNukeManager {
    constructor() {
        this.recentActions = {
            bans: {},
            kicks: {},
            unbans: {},
            channelDeletions: {},
            channelCreations: {},
            channelUpdates: {}, 
            roleDeletions: {},
            roleCreations: {},
            memberUpdates: {}
        };

        
        this.activeOperations = new Map(); 

        
        setInterval(() => {
            this.cleanupStaleOperations();
        }, 30000);
    }

    
    isProtectedServer(guildId) {
        if (!global.config?.protectedServers) {
            return false;
        }
        return global.config.protectedServers.includes(guildId);
    }

    
    shouldIgnore(userId) {
        return this.isBot(userId) || WhitelistManager.shouldBypass(userId);
    }

    
    isBot(userId) {
        return userId === global.client?.user?.id;
    }

    
    isAutoRecoveryEnabled() {
        return global.config?.antinuke_settings?.auto_recovery === true;
    }

    
    isChannelRecoveryEnabled() {
        return global.config?.antinuke_settings?.recover_channels === true && this.isAutoRecoveryEnabled();
    }

    
    isRoleRecoveryEnabled() {
        return global.config?.antinuke_settings?.recover_roles === true && this.isAutoRecoveryEnabled();
    }

    
    isKickRecoveryEnabled() {
        return global.config?.antinuke_settings?.recover_kicks === true;
    }

    
    getRecoveryDelay() {
        return global.config?.antinuke_settings?.recovery_delay || 1500;
    }

    
    cleanupActionData(actionType, userId, guildId) {
        if (this.recentActions[actionType]?.[guildId]) {
            
            this.recentActions[actionType][guildId] = this.recentActions[actionType][guildId]
                .filter(action => action.userId !== userId);

            
            if (this.recentActions[actionType][guildId].length === 0) {
                delete this.recentActions[actionType][guildId];
            }

            if (Object.keys(this.recentActions[actionType]).length === 0) {
                delete this.recentActions[actionType];
            }
        }
    }

    
    recordAction(actionType, userId, guildId, forceThreshold = false) {
        
        if (this.isUserBeingProcessed(userId)) {
            Logger.debug(`🚫 User ${userId} already being processed - skipping duplicate ${actionType} action`);
            return false; 
        }

        const now = Date.now();
        const timeWindow = global.config?.antinuke_settings?.time_window || 36000000; 

        
        if (!this.recentActions[actionType]) {
            this.recentActions[actionType] = {};
        }

        
        if (!this.recentActions[actionType][guildId]) {
            this.recentActions[actionType][guildId] = [];
        }

        
        this.recentActions[actionType][guildId].push({
            userId,
            timestamp: now
        });

        
        const actionsByUser = this.recentActions[actionType][guildId].filter(
            action => action.userId === userId && (now - action.timestamp) < timeWindow
        ).length;

        
        const thresholds = global.config?.antinuke_settings || {};
        let actionKey = actionType;

        
        if (actionType === 'channelDeletions') actionKey = 'channel_delete_limit';
        else if (actionType === 'channelCreations') actionKey = 'channel_create_limit';
        else if (actionType === 'channelUpdates') actionKey = 'channel_update_limit';
        else if (actionType === 'roleDeletions') actionKey = 'role_delete_limit';
        else if (actionType === 'roleCreations') actionKey = 'role_create_limit';
        else if (actionType === 'memberUpdates') actionKey = 'member_update_limit';
        else if (actionType === 'bans') actionKey = 'ban_limit';
        else if (actionType === 'kicks') actionKey = 'kick_limit';
        else if (actionType === 'unbans') actionKey = 'unban_limit';
        else if (actionType === 'botAdditions') actionKey = 'bot_add_limit'; 

        const threshold = thresholds[actionKey] || 5; 

        const thresholdExceeded = forceThreshold || (actionsByUser >= threshold);

        if (thresholdExceeded) {
            if (forceThreshold) {
                Logger.warn(`Forced threshold exceeded for ${userId} (${actionsByUser}/${threshold}) for ${actionType}`, 'warning');
            } else {
                Logger.warn(`Action threshold exceeded by ${userId} (${actionsByUser}/${threshold}) for ${actionType}`, 'warning');
            }

            
            this.markUserAsBeingProcessed(userId, actionType, guildId);
        }

        
        this.sendThresholdWebhook(userId, guildId, actionType, actionsByUser, threshold);

        return thresholdExceeded;
    }

    
    async sendThresholdWebhook(userId, guildId, actionType, currentCount, threshold) {
        const webhookUrl = global.config?.logs?.log_webhook;

        if (!webhookUrl || webhookUrl.length < 8) {
            return; 
        }

        try {
            const guild = global.client.guilds.cache.get(guildId);
            const user = await global.client.users.fetch(userId).catch(() => null);

            const percentage = Math.round((currentCount / threshold) * 100);
            const statusText = currentCount >= threshold ? '⚠️ THRESHOLD EXCEEDED' : '⚡ MONITORING';

            const { WebhookClient, MessageEmbed } = await import('discord.js-selfbot-v13');

            const embed = new MessageEmbed()
                .setTitle(`🚨 Anti-Nuke Alert - ${statusText}`)
                .setDescription(`**Server**: ${guild ? guild.name : guildId}\n` +
                               `**User**: ${user ? user.tag : userId}\n` +
                               `**Action**: ${actionType.replace(/([A-Z])/g, ' $1').toLowerCase()}\n` +
                               `**Progress**: ${currentCount}/${threshold} (${percentage}%)\n` +
                               `**Status**: ${currentCount >= threshold ? 'ACTION TAKEN' : 'APPROACHING THRESHOLD'}`)
                .setColor(0x8b5cf6) 
                .setThumbnail(user?.displayAvatarURL({ dynamic: true, size: 128 }) || null)
                .setTimestamp()
                .setFooter({ text: 'Discord AntiNuke Selfbot' });

            
            await RateLimitManager.execute(
                'webhook.threshold',
                async () => {
                    const webhook = new WebhookClient({ url: webhookUrl });
                    await webhook.send({
                        embeds: [embed],
                        username: 'Vantrix'
                    });
                    webhook.destroy();
                },
                [],
                { retryLimit: 2, initialBackoff: 2000 }
            );

        } catch (error) {
            
            Logger.debug(`Webhook notification failed: ${error.message} (Code: ${error.code || 'N/A'})`);
            Logger.debug(`Webhook URL: ${webhookUrl?.substring(0, 100)}...`);
        }
    }



    
    async sendPunishmentWebhook(guild, member, actionMessage, wasPunished, reason) {
        const webhookUrl = global.config?.logs?.log_webhook;

        if (!webhookUrl || webhookUrl.length < 8) {
            return; 
        }

        try {
            const punishmentType = global.config?.antinuke_settings?.punishment || 'ban';

            
            const { WebhookClient, MessageEmbed } = await import('discord.js-selfbot-v13');

            const embed = new MessageEmbed()
                .setTitle(wasPunished ? `🛡️ Anti-Nuke Action Taken` : `⚠️ Anti-Nuke Activity Detected`)
                .setDescription(`**Server**: ${guild.name}\n` +
                               `**Target**: ${member.user.tag}\n` +
                               `**Action**: ${actionMessage}\n` +
                               `**Reason**: ${reason}\n` +
                               `**Punishment Type**: ${punishmentType}`)
                .setColor(0xFF0000) 
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .setTimestamp()
                .setFooter({ text: 'Discord AntiNuke Selfbot' });

            
            await RateLimitManager.execute(
                'webhook.punishment',
                async () => {
                    const webhook = new WebhookClient({ url: webhookUrl });
                    await webhook.send({
                        embeds: [embed],
                        username: 'Vantrix'
                    });
                    webhook.destroy();
                },
                [],
                { retryLimit: 2, initialBackoff: 2000 }
            );

        } catch (error) {
            
            Logger.debug(`Webhook notification failed: ${error.message} (Code: ${error.code || 'N/A'})`);
            Logger.debug(`Webhook URL: ${webhookUrl?.substring(0, 100)}...`);
        }
    }

    
    async sendHierarchyBlockedWebhook(guild, member, attemptedAction, reason) {
        const webhookUrl = global.config?.logs?.log_webhook;

        if (!webhookUrl || webhookUrl.length < 8) {
            return; 
        }

        try {
            const botMember = guild.members.me;
            const botRolePos = botMember?.roles.highest?.position || 0;
            const targetRolePos = member.roles.highest.position;

            
            const { WebhookClient, MessageEmbed } = await import('discord.js-selfbot-v13');

            const embed = new MessageEmbed()
                .setTitle(`🚫 Anti-Nuke Protection - Hierarchy Block`)
                .setDescription(`**Server**: ${guild.name}\n` +
                               `**Target**: ${member.user.tag}\n` +
                               `**Attempted Action**: ${attemptedAction}\n` +
                               `**Reason**: ${reason}\n` +
                               `**Block Reason**: Role hierarchy protection\n` +
                               `**Bot Role Position**: ${botRolePos}\n` +
                               `**Target Role Position**: ${targetRolePos}\n` +
                               `**Status**: User spared - threshold still counted`)
                .setColor(0xf59e0b) 
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .setTimestamp()
                .setFooter({ text: 'Discord AntiNuke Selfbot - Hierarchy Protection' });

            
            await RateLimitManager.execute(
                'webhook.hierarchy',
                async () => {
                    const webhook = new WebhookClient({ url: webhookUrl });
                    await webhook.send({
                        embeds: [embed],
                        username: 'Vantrix'
                    });
                    webhook.destroy();
                },
                [],
                { retryLimit: 2, initialBackoff: 2000 }
            );

        } catch (error) {
            
            Logger.debug(`Hierarchy webhook notification failed: ${error.message} (Code: ${error.code || 'N/A'})`);
            Logger.debug(`Webhook URL: ${webhookUrl?.substring(0, 100)}...`);
        }
    }

    
    async punish(userId, guildId, reason) {
        try {
            const guild = global.client.guilds.cache.get(guildId);
            if (!guild) {
                Logger.error(`Cannot punish: Guild ${guildId} not found`);
                return false;
            }

            
            if (userId === global.client.user.id) {
                Logger.warn('Cannot punish self - self-protection activated');
                return false;
            }

            
            if (WhitelistManager.isOwner(userId)) {
                Logger.warn(`Cannot punish owner ${userId} - owner protection`);
                return false;
            }

            
            const punishment = global.config?.antinuke_settings?.punishment || 'ban';

            
            const member = await RateLimitManager.execute(
                `guild.${guildId}.members.fetch.${userId}`,
                async () => await guild.members.fetch(userId),
                [],
                { retryLimit: 2 }
            ).catch(() => null);

            if (!member) {
                Logger.warn(`Cannot fetch member ${userId} for punishment - user may have left or be cached`);
                return false;
            }

            
            const botMember = guild.members.me;
            if (!botMember) {
                Logger.error(`Cannot get bot member in ${guild.name} - missing member cache`);
                return false;
            }

            
            const requiredPerm = punishment === 'ban' ? 'BAN_MEMBERS' : 'KICK_MEMBERS';
            if (!botMember.permissions.has(requiredPerm)) {
                Logger.error(`Missing ${requiredPerm} permission in ${guild.name} - cannot execute punishment`);
                if (!botMember.permissions.has('ADMINISTRATOR')) {
                    Logger.error(`Bot lacks both ${requiredPerm} and ADMINISTRATOR permissions`);
                    Logger.error(`Skipping punishment due to permission failure - permissions should be fixed`);
                    
                    Logger.warn(`⚠️ Permission failure detected - ${member.user.tag} not punished due to missing ${requiredPerm}`);
                    return false;
                }
                Logger.warn(`Bot has ADMINISTRATOR permission - proceeding despite missing ${requiredPerm}`);
            }

            
            if (member.roles.highest.position >= botMember.roles.highest.position) {
                Logger.error(`Cannot ${punishment} ${member.user.tag} - target has equal/higher role than bot`);
                Logger.error(`Bot role position: ${botMember.roles.highest.position}, Target role position: ${member.roles.highest.position}`);

                
                await this.sendHierarchyBlockedWebhook(guild, member, `${punishment} attempted but blocked by role hierarchy`, reason);

                Logger.warn(`📊 Hierarchy protection triggered - ${member.user.tag} spared from punishment`);
                
                return false;
            }

            
            const memberPerms = member.permissions.toArray();
            const dangerousPerms = ['ADMINISTRATOR', 'BAN_MEMBERS', 'KICK_MEMBERS', 'MANAGE_ROLES', 'MANAGE_GUILD'];

            const hasDangerousPerms = dangerousPerms.some(perm => memberPerms.includes(perm));
            if (hasDangerousPerms) {
                Logger.warn(`Staff member detected: ${member.user.tag} (${dangerousPerms.filter(perm => memberPerms.includes(perm)).join(', ')})`);
                
            }

            const fullReason = `[AntiNuke] ${reason}`;

            let actionMessage = '';

            if (punishment === 'ban') {
                
                await RateLimitManager.execute(
                    `guild.${guildId}.members.ban`,
                    async () => await member.ban({ reason: fullReason }),
                    [],
                    { retryLimit: 3 }
                );

                Logger.success(`Banned ${member.user.tag} (${member.id}): ${reason}`);
                actionMessage = 'Banned';

            } else if (punishment === 'kick') {
                
                await RateLimitManager.execute(
                    `guild.${guildId}.members.kick`,
                    async () => await member.kick(fullReason),
                    [],
                    { retryLimit: 3 }
                );

                Logger.success(`✅ Kicked ${member.user.tag} (${member.id}): ${reason}`);
                actionMessage = 'Kicked';

            } else if (punishment === 'none') {
                
                Logger.warn(`⚠️ Detected malicious activity: ${member.user.tag} (${member.id}): ${reason}`);
                Logger.warn(`📊 Punishment type set to 'none' - no action taken, but alerts sent`);
                actionMessage = 'Detected (No Action)';

            } else {
                Logger.error(`Unknown punishment type: ${punishment}. Valid: 'ban', 'kick', 'none'`);
                Logger.info(`Would punish ${member.user.tag} (${member.id}): ${reason} (invalid punishment type)`);
                actionMessage = 'Detected (Invalid Punishment Type)';
            }

            
            await this.sendPunishmentWebhook(guild, member, actionMessage, punishment === 'none' ? false : true, reason);

            
            if (actionMessage !== 'Detected (Invalid Punishment Type)') {
                await this.notifyOwnersSafe(guild, member, actionMessage.toLowerCase().replace(' ', '_'), reason);
            }

            return true;

        } catch (error) {
            Logger.error(`Failed to punish ${userId}: ${error.message}`);
            Logger.debug(`Error stack: ${error.stack}`);
            return false;
        }
    }

    
    async notifyOwnersSafe(guild, member, action, reason) {
        
        if (global.config?.logs?.log_owner_dm !== true) {
            Logger.debug('Owner DM notifications disabled in config');
            return;
        }

        const message = `🛡️ **ANTI-NUKE ACTION TAKEN**\n` +
                       `**Server:** ${guild.name}\n` +
                       `**User:** ${member.user.tag} (${member.id})\n` +
                       `**Action:** ${action.toUpperCase()}\n` +
                       `**Reason:** ${reason}\n` +
                       `**Time:** ${new Date().toISOString()}`;

        const owners = WhitelistManager.getAllOwners();

        if (owners.length === 0) {
            Logger.debug('No owners to notify about punishment action');
            return;
        }

        Logger.debug(`Attempting to notify ${owners.length} owners about ${action} action`);

        let notifiedCount = 0;
        let failedCount = 0;

        for (const ownerId of owners) {
            try {
                
                const owner = await RateLimitManager.execute(
                    `users.fetch.${ownerId}`,
                    async () => await global.client.users.fetch(ownerId),
                    [],
                    { retryLimit: 1 }
                ).catch(() => null);

                if (!owner) {
                    Logger.debug(`Could not fetch owner user ${ownerId}`);
                    failedCount++;
                    continue;
                }

                
                await RateLimitManager.execute(
                    `users.${ownerId}.send`,
                    async () => await owner.send(message),
                    [],
                    { retryLimit: 2 }
                );

                notifiedCount++;
                Logger.debug(`Successfully notified owner ${owner.user?.tag || ownerId}`);

            } catch (error) {
                failedCount++;

                
                if (error.code === 50007) {
                    
                    Logger.debug(`Owner ${ownerId} has DMs disabled - notification skipped`);
                } else if (error.code === 50013) {
                    
                    Logger.debug(`Missing permissions to DM owner ${ownerId}`);
                } else if (error.code === 10013) {
                    
                    Logger.debug(`Owner ${ownerId} is an unknown user`);
                } else {
                    
                    Logger.debug(`Unexpected error notifying owner ${ownerId}: ${error.message}`);
                }
            }
        }

        
        if (failedCount > 0 || Logger.shouldLog('info')) {
            Logger.info(`Owner notifications: ${notifiedCount} sent, ${failedCount} failed`);
        }
    }

    
    shouldIgnoreEvent(guildId, userId) {
        
        if (!this.isProtectedServer(guildId)) {
            return true;
        }

        
        if (this.shouldIgnore(userId)) {
            Logger.debug(`Ignoring event from whitelisted/bypassed user ${userId} in ${guildId}`);
            return true;
        }

        return false;
    }

    
    getStats() {
        const now = Date.now();
        const timeWindow = global.config?.antinuke_settings?.time_window || 36000000;

        let totalActions = 0;
        const stats = {};

        for (const [actionType, guilds] of Object.entries(this.recentActions)) {
            stats[actionType] = {};

            for (const [guildId, actions] of Object.entries(guilds)) {
                
                const recentActions = actions.filter(action => (now - action.timestamp) < timeWindow);

                if (recentActions.length > 0) {
                    stats[actionType][guildId] = recentActions.length;
                    totalActions += recentActions.length;
                }
            }
        }

        return {
            totalActions,
            byActionType: stats,
            thresholds: global.config?.antinuke_settings || {}
        };
    }

    
    isUserBeingProcessed(userId) {
        const operation = this.activeOperations.get(userId);
        if (!operation) return false;

        
        const now = Date.now();
        const operationTimeout = 5 * 60 * 1000; 

        if ((now - operation.startedAt) > operationTimeout) {
            
            this.activeOperations.delete(userId);
            Logger.debug(`🧹 Auto-cleaned stale operation for user ${userId}`);
            return false;
        }

        return true;
    }

    
    markUserAsBeingProcessed(userId, actionType, guildId) {
        this.activeOperations.set(userId, {
            actionType,
            guildId,
            startedAt: Date.now(),
            status: 'processing'
        });

        Logger.debug(`🔒 User ${userId} marked as processing ${actionType} in guild ${guildId}`);
    }

    
    markOperationComplete(userId) {
        const operation = this.activeOperations.get(userId);
        if (operation) {
            operation.status = 'completed';
            operation.completedAt = Date.now();

            
            setTimeout(() => {
                this.activeOperations.delete(userId);
                Logger.debug(`🧹 Cleaned completed operation for user ${userId}`);
            }, 30000); 

            Logger.debug(`✅ User ${userId} operation completed`);
        }
    }

    
    cleanupStaleOperations() {
        const now = Date.now();
        const operationTimeout = 5 * 60 * 1000; 
        let cleanedCount = 0;

        for (const [userId, operation] of this.activeOperations.entries()) {
            if ((now - operation.startedAt) > operationTimeout) {
                this.activeOperations.delete(userId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            Logger.debug(`🧹 Cleaned ${cleanedCount} stale operations`);
        }
    }

    
    getMemoryStats() {
        const now = Date.now();
        const timeWindow = global.config?.antinuke_settings?.time_window || 36000000;

        let totalStoredActions = 0;
        let recentActions = 0;
        let expiredActions = 0;

        for (const [actionType, guilds] of Object.entries(this.recentActions)) {
            for (const [guildId, actions] of Object.entries(guilds)) {
                totalStoredActions += actions.length;

                for (const action of actions) {
                    if ((now - action.timestamp) < timeWindow) {
                        recentActions++;
                    } else {
                        expiredActions++;
                    }
                }
            }
        }

        const activeOperationsCount = this.activeOperations.size;
        const operationStats = Array.from(this.activeOperations.values()).reduce(
            (stats, op) => {
                const statusKey = op.status || 'unknown';
                stats[statusKey] = (stats[statusKey] || 0) + 1;
                return stats;
            },
            {}
        );

        return {
            totalStoredActions,
            recentActions,
            expiredActions,
            cleanupNeeded: expiredActions > 0,
            guildsWithData: Object.keys(this.recentActions).length,
            averageActionsPerGuild: Object.keys(this.recentActions).length > 0 ?
                (totalStoredActions / Object.keys(this.recentActions).length).toFixed(2) : 0,
            activeOperations: {
                total: activeOperationsCount,
                byStatus: operationStats
            }
        };
    }

    cleanupExpiredActions() {
        const now = Date.now();
        const timeWindow = global.config?.antinuke_settings?.time_window || 36000000;

        let totalRemoved = 0;
        let guildsCleaned = 0;

        for (const [actionType, guilds] of Object.entries(this.recentActions)) {
            for (const [guildId, actions] of Object.entries(guilds)) {
                const originalLength = actions.length;

                this.recentActions[actionType][guildId] = actions.filter(
                    action => (now - action.timestamp) < timeWindow
                );

                const removed = originalLength - this.recentActions[actionType][guildId].length;
                if (removed > 0) {
                    totalRemoved += removed;
                    guildsCleaned++;
                }

                
                if (this.recentActions[actionType][guildId].length === 0) {
                    delete this.recentActions[actionType][guildId];
                }
            }

            
            if (Object.keys(this.recentActions[actionType]).length === 0) {
                delete this.recentActions[actionType];
            }
        }

        return {
            totalRemoved,
            guildsCleaned,
            activeGuilds: Object.keys(this.recentActions).length
        };
    }
}

const antiNukeManager = new AntiNukeManager();
export default antiNukeManager;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */