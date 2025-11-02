import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const originalChannelsCache = new Map();

export default {
    name: 'channelUpdate',
    once: false,
    async execute(client, oldChannel, newChannel) {

        if (!newChannel.guild) return;

        if (AntiNukeManager.shouldIgnoreEvent(newChannel.guild.id, 'SYSTEM')) {
            return;
        }

        Logger.warn(`📝 Channel updated: #${oldChannel.name} → #${newChannel.name} (${newChannel.id}) in ${newChannel.guild.name}`, 'warning');

        if (!originalChannelsCache.has(newChannel.guild.id)) {
            originalChannelsCache.set(newChannel.guild.id, new Map());
        }

        const guildCache = originalChannelsCache.get(newChannel.guild.id);

        if (!guildCache.has(newChannel.id)) {
            const originalData = {
                id: oldChannel.id,
                name: oldChannel.name,
                type: oldChannel.type,
                topic: oldChannel.topic,
                nsfw: oldChannel.nsfw,
                bitrate: oldChannel.bitrate,
                userLimit: oldChannel.userLimit,
                rateLimitPerUser: oldChannel.rateLimitPerUser,
                position: oldChannel.position,
                parentId: oldChannel.parentId,
                permissionOverwrites: oldChannel.permissionOverwrites.cache.map(overwrite => ({
                    id: overwrite.id,
                    type: overwrite.type,
                    allow: overwrite.allow.toArray(),
                    deny: overwrite.deny.toArray()
                })),
                updatedAt: Date.now()
            };
            guildCache.set(newChannel.id, originalData);
        }

        try {

            if (!newChannel.guild) {
                Logger.warn(`⚠️ Guild not available for channel ${newChannel.id}`);
                return;
            }

            async function fetchAuditLogs(type) {
                try {
                    const auditLogs = await newChannel.guild.fetchAuditLogs({
                        type: type,
                        limit: 1
                    });

                    return auditLogs;
                } catch (error) {
                    Logger.error(`❌ Audit log fetch failed for type ${type}: ${error.message}`);
                    return null;
                }
            }

            let updateEntry = null;
            const auditTypes = [11, 14, 13, 15];

            for (const type of auditTypes) {
                const auditLogs = await fetchAuditLogs(type);
                if (!auditLogs) {
                    continue;
                }

                const entry = auditLogs.entries.find(entry => {
                    const targetId = entry.target?.id;
                    const executorExists = !!entry.executor;
                    const isRecent = entry.createdTimestamp && (Date.now() - entry.createdTimestamp) < 30000;

                    return targetId === newChannel.id &&
                           executorExists &&
                           isRecent;
                });

                if (entry) {
                    updateEntry = entry;
                    break;
                }
            }

            if (updateEntry && updateEntry.executor) {
                const executor = updateEntry.executor;
                Logger.warn(`👤 Channel updated by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'channelUpdates',
                    executor.id,
                    newChannel.guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 CHANNEL UPDATE THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    const recentUpdates = Array.from(guildCache.values()).filter(
                        data => (Date.now() - data.updatedAt) < 60000
                    );

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        newChannel.guild.id,
                        `Mass channel update detected - Updated ${recentUpdates.length} channels`
                    );

                    if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - restoring original settings for ${recentUpdates.length} channels`, 'warning');

                        const restorePromises = recentUpdates.map(data =>
                            restoreChannelToOriginal(newChannel.guild.channels.cache.get(data.id) || null, data)
                        );

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled').length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Channel restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        if (successfulRestores > 0) {
                            recentUpdates.forEach(data => guildCache.delete(data.id));
                        }

                    } else if (!executorPunished) {
                        Logger.info(`🔄 Punishment failed - not attempting channel restoration`, 'info');
                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping channel updates`, 'info');
                    }

                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('channelUpdates', executor.id, newChannel.guild.id);
                    } else {
                        AntiNukeManager.cleanupActionData('channelUpdates', executor.id, newChannel.guild.id);
                    }

                    Logger.success(`⚔️ Anti-channel update operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Channels updated: ${recentUpdates.length}`);
                    Logger.success(`Channels restored: ${executorPunished && AntiNukeManager.isChannelRecoveryEnabled() ? recentUpdates.length : 0}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.warn(`⚠️ Could not identify channel updater from audit logs`, 'warning');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for channel update: ${error.message}`, 'error');
        }

        const now = Date.now();
        for (const [guildId, guildCache] of originalChannelsCache.entries()) {
            for (const [channelId, channelData] of guildCache.entries()) {
                if ((now - channelData.updatedAt) > 300000) {
                    guildCache.delete(channelId);
                }
            }

            if (guildCache.size === 0) {
                originalChannelsCache.delete(guildId);
            }
        }
    }
};

async function restoreChannelToOriginal(currentChannel, originalData) {
    try {
        if (!currentChannel) {
            return false;
        }

        await RateLimitManager.execute(
            `guild.${currentChannel.guild.id}.channels.restore.${currentChannel.id}`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay());

                await currentChannel.edit({
                    name: originalData.name,
                    topic: originalData.topic,
                    nsfw: originalData.nsfw,
                    bitrate: originalData.bitrate,
                    userLimit: originalData.userLimit,
                    rateLimitPerUser: originalData.rateLimitPerUser,
                    position: originalData.position,
                    reason: '[AntiNuke] Reverting malicious channel updates'
                });

                if (originalData.parentId) {
                    await currentChannel.setParent(originalData.parentId);
                }

                if (originalData.permissionOverwrites && originalData.permissionOverwrites.length > 0) {
                    try {
                        await currentChannel.permissionOverwrites.set(
                            originalData.permissionOverwrites.map(overwrite => ({
                                id: overwrite.id,
                                allow: overwrite.allow,
                                deny: overwrite.deny,
                                type: overwrite.type
                            })),
                            '[AntiNuke] Reverting malicious permission changes'
                        );
                    } catch (error) {
                    }
                }

                Logger.success(`✅ Restored channel #${currentChannel.name} to original settings`);
                return currentChannel;
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        return true;

    } catch (error) {
        Logger.error(`Failed to restore channel #${originalData.name}: ${error.message}`);
        return false;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */