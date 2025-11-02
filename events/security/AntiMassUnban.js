import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const recentUnbansCache = new Map();

export default {
    name: 'guildBanRemove',
    once: false,
    async execute(client, ban) {
        const guild = ban.guild;
        const unbannedUser = ban.user;

        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return;
        }

        Logger.warn(`🚫 Ban removed for: ${unbannedUser.tag} (${unbannedUser.id}) in ${guild.name}`, 'warning');

        if (!recentUnbansCache.has(guild.id)) {
            recentUnbansCache.set(guild.id, new Map());
        }

        const guildCache = recentUnbansCache.get(guild.id);

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: 23,
                limit: 1
            });

            const unbanEntry = auditLogs.entries.find(entry =>
                entry.target?.id === unbannedUser.id &&
                entry.executor &&
                (Date.now() - entry.createdTimestamp) < 30000
            );

            if (unbanEntry && unbanEntry.executor) {
                const executor = unbanEntry.executor;
                Logger.warn(`👤 Ban removed by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const unbanData = {
                    userId: unbannedUser.id,
                    userTag: unbannedUser.tag,
                    unbannerId: executor.id,
                    unbannedAt: Date.now(),
                    reason: unbanEntry.reason || 'No reason provided'
                };

                guildCache.set(unbannedUser.id, unbanData);

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'unbans',
                    executor.id,
                    guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 MASS UNBAN THRESHOLD EXCEEDED - Executing unban recovery`, 'warning');

                    const recentlyUnbanned = Array.from(guildCache.values()).filter(
                        unban => unban.unbannerId === executor.id &&
                               (Date.now() - unban.unbannedAt) < 60000
                    );

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass unbanning detected - Unbanned ${recentlyUnbanned.length} users`
                    );

                    if (executorPunished) {
                        Logger.warn(`🔄 Mass unban recovery enabled - re-banning ${recentlyUnbanned.length} recently unbanned users`, 'warning');

                        const reBanPromises = recentlyUnbanned.map(unbanData =>
                            reBanUser(guild, unbanData.userId, unbanData.userTag, unbanData.reason)
                        );

                        const reBanResults = await Promise.allSettled(reBanPromises);
                        const successfulReBans = reBanResults.filter(r => r.status === 'fulfilled').length;
                        const failedReBans = reBanResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Mass unban recovery: ${successfulReBans} succeeded, ${failedReBans} failed`);

                        if (successfulReBans > 0) {
                            recentlyUnbanned.forEach(unban => guildCache.delete(unban.userId));
                        }

                    } else {
                        Logger.info(`🔄 Punishment failed - not attempting re-banning as safety measure`, 'info');

                        AntiNukeManager.cleanupActionData('unbans', executor.id, guild.id);
                    }

                    if (executorPunished) {
                        AntiNukeManager.cleanupActionData('unbans', executor.id, guild.id);
                    }

                    Logger.success(`⚔️ Anti-mass unban operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Users unbanned: ${recentlyUnbanned.length}`);
                    Logger.success(`Users re-banned: ${executorPunished ? recentlyUnbanned.length : 0}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.debug(`ℹ️ Ban removal not traceable to specific executor for ${unbannedUser.tag}`, 'debug');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for unban: ${error.message}`, 'error');
        }

        const now = Date.now();
        for (const [guildId, guildUnbans] of recentUnbansCache.entries()) {
            for (const [userId, unbanData] of guildUnbans.entries()) {
                if ((now - unbanData.unbannedAt) > 300000) {
                    guildUnbans.delete(userId);
                }
            }

            if (guildUnbans.size === 0) {
                recentUnbansCache.delete(guildId);
            }
        }
    }
};

async function reBanUser(guild, userId, userTag, originalReason) {
    try {
        await RateLimitManager.execute(
            `guild.${guild.id}.members.ban.${userId}`,
            async () => await guild.members.ban(
                userId,
                { reason: `[AntiNuke] Re-banning user unbanned by mass unbanner - Original reason: ${originalReason}` }
            ),
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        Logger.success(`✅ Re-banned user ${userTag} (${userId}) from ${guild.name}`);
        return true;

    } catch (error) {
        Logger.error(`Failed to re-ban ${userTag} (${userId}): ${error.message}`);
        return false;
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */