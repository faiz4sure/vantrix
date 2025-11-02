

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';


const recentBansCache = new Map();

export default {
    name: 'guildBanAdd',
    once: false, 
    async execute(client, ban) {
        const guild = ban.guild;
        const bannedUser = ban.user;

        
        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return; 
        }

        Logger.warn(`🚫 User banned: ${bannedUser.tag} (${bannedUser.id}) in ${guild.name}`, 'warning');

        
        if (!recentBansCache.has(guild.id)) {
            recentBansCache.set(guild.id, new Map());
        }

        const guildCache = recentBansCache.get(guild.id);

        
        try {
            const auditLogs = await RateLimitManager.execute(
                `guild.${guild.id}.auditLogs.bans`,
                async () => await guild.fetchAuditLogs({
                    type: 22, 
                    limit: 1
                }),
                [],
                { retryLimit: 2, initialBackoff: 1000 }
            );

            const banEntry = auditLogs.entries.find(entry =>
                entry.target?.id === bannedUser.id &&
                entry.executor && 
                (Date.now() - entry.createdTimestamp) < 30000 
            );

            if (banEntry && banEntry.executor) {
                const executor = banEntry.executor;
                Logger.warn(`👤 User banned by: ${executor.tag} (${executor.id})`, 'warning');

                
                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const banData = {
                    userId: bannedUser.id,
                    userTag: bannedUser.tag,
                    bannerId: executor.id,
                    bannedAt: Date.now(),
                    reason: banEntry.reason || 'No reason provided'
                };

                guildCache.set(bannedUser.id, banData);

                
                const thresholdExceeded = AntiNukeManager.recordAction(
                    'bans',
                    executor.id,
                    guild.id,
                    false 
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 MASS BAN THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    
                    const recentlyBanned = Array.from(guildCache.values()).filter(
                        ban => ban.bannerId === executor.id &&
                              (Date.now() - ban.bannedAt) < 60000
                    );

                    
                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass banning detected - Banned ${recentlyBanned.length} users`
                    );

                    
                    if (executorPunished) {
                        Logger.warn(`🔄 Auto-recovery enabled - unbanning ${recentlyBanned.length} recently banned users`, 'warning');

                        
                        const unbanPromises = recentlyBanned.map(banData =>
                            unbanUser(guild, banData.userId, banData.userTag, banData.reason)
                        );

                        const unbanResults = await Promise.allSettled(unbanPromises);
                        const successfulUnbans = unbanResults.filter(r => r.status === 'fulfilled').length;
                        const failedUnbans = unbanResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Unban recovery: ${successfulUnbans} succeeded, ${failedUnbans} failed`);

                        if (successfulUnbans > 0) {

                            recentlyBanned.forEach(ban => guildCache.delete(ban.userId));
                        }

                    } else {
                        Logger.info(`🔄 Punishment failed - not attempting unbanning as safety measure`, 'info');

                        AntiNukeManager.cleanupActionData('bans', executor.id, guild.id);
                    }

                    if (executorPunished) {

                        AntiNukeManager.cleanupActionData('bans', executor.id, guild.id);
                    }


                    
                    Logger.success(`⚔️ Anti-mass ban operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Users banned: ${recentlyBanned.length}`);
                    Logger.success(`Users unbanned: ${executorPunished ? recentlyBanned.length : 0}`);

                    
                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                
                Logger.warn(`⚠️ Could not identify banning user from audit logs`, 'warning');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for ban: ${error.message}`, 'error');
        }

        
        const now = Date.now();
        for (const [guildId, guildBans] of recentBansCache.entries()) {
            for (const [userId, banData] of guildBans.entries()) {
                if ((now - banData.bannedAt) > 300000) {
                    guildBans.delete(userId);
                }
            }

            if (guildBans.size === 0) {
                recentBansCache.delete(guildId);
            }
        }
    }
};


async function unbanUser(guild, userId, userTag, originalReason) {
    try {
        
        await RateLimitManager.execute(
            `guild.${guild.id}.members.unban.${userId}`,
            async () => await guild.members.unban(
                userId,
                `[AntiNuke] Unbanning user banned by mass banner - Original reason: ${originalReason}`
            ),
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        Logger.success(`✅ Unbanned user ${userTag} (${userId}) from ${guild.name}`);
        return true;

    } catch (error) {
        Logger.error(`Failed to unban ${userTag} (${userId}): ${error.message}`);
        return false;
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */