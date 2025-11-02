

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';


const deletedChannelsCache = new Map();

export default {
    name: 'channelDelete',
    once: false, 
    async execute(client, channel) {
        
        if (!channel.guild) return;

        
        if (AntiNukeManager.shouldIgnoreEvent(channel.guild.id, 'SYSTEM')) {
            return; 
        }

        Logger.warn(`🗑️ Channel deleted: #${channel.name} (${channel.id}) in ${channel.guild.name}`, 'warning');

        
        const channelMetadata = {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            topic: channel.topic,
            nsfw: channel.nsfw,
            bitrate: channel.bitrate,
            userLimit: channel.userLimit,
            rateLimitPerUser: channel.rateLimitPerUser,
            position: channel.position,
            parentId: channel.parentId,
            permissionOverwrites: channel.permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                type: overwrite.type,
                allow: overwrite.allow.bitfield,
                deny: overwrite.deny.bitfield
            })),
            reason: '[AntiNuke] Channel restored after malicious deletion',
            deletedAt: Date.now()
        };

        
        const cacheKey = `${channel.guild.id}`;

        if (!deletedChannelsCache.has(cacheKey)) {
            deletedChannelsCache.set(cacheKey, []);
        }
        deletedChannelsCache.get(cacheKey).push(channelMetadata);

        
        if (deletedChannelsCache.get(cacheKey).length > 100) {
            deletedChannelsCache.set(cacheKey, deletedChannelsCache.get(cacheKey).slice(-100));
        }

        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: 12, 
                limit: 1
            });

            const deleteEntry = auditLogs.entries.find(entry =>
                entry.target?.id === channel.id &&
                (Date.now() - entry.createdTimestamp) < 30000 
            );

            if (deleteEntry && deleteEntry.executor) {
                const executor = deleteEntry.executor;
                Logger.warn(`👤 Channel deleted by: ${executor.tag} (${executor.id})`, 'warning');

                
                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }


                const thresholdExceeded = AntiNukeManager.recordAction(
                    'channelDeletions',
                    executor.id,
                    channel.guild.id,
                    false 
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 CHANNEL DELETION THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    
                    const userDeletedChannels = deletedChannelsCache.get(cacheKey)?.filter(
                        meta => (Date.now() - meta.deletedAt) < 60000 
                    ) || [channelMetadata];

                    
                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        channel.guild.id,
                        `Mass channel deletion detected - Deleted ${userDeletedChannels.length} channels`
                    );

                    
                    if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - restoring ${userDeletedChannels.length} deleted channels`, 'warning');

                        
                        const restorePromises = userDeletedChannels.map(meta =>
                            restoreDeletedChannel(channel.guild, meta)
                        );

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled').length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Channel restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        if (successfulRestores > 0) {

                            deletedChannelsCache.delete(cacheKey);
                        }

                    } else if (!executorPunished) {
                        Logger.info(`🔄 Punishment failed - not attempting channel restoration`, 'info');
                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping channels deleted`, 'info');
                    }

                    
                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('channelDeletions', executor.id, channel.guild.id);
                    } else {

                        AntiNukeManager.cleanupActionData('channelDeletions', executor.id, channel.guild.id);
                    }

                    
                    Logger.success(`⚔️ Anti-channel deletion operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Channels deleted: ${userDeletedChannels.length}`);
                    Logger.success(`Channels restored: ${executorPunished && AntiNukeManager.isChannelRecoveryEnabled() ? userDeletedChannels.length : 0}`);

                    
                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                
                Logger.warn(`⚠️ Could not identify channel deleter from audit logs`, 'warning');

                
                if (AntiNukeManager.isChannelRecoveryEnabled()) {
                    const restored = await restoreDeletedChannel(channel.guild, channelMetadata);
                    Logger.warn(`🔄 Channel ${restored ? 'restored' : 'could not be restored'} as safety measure`, 'warning');
                } else {
                    Logger.info(`🔄 Auto-recovery disabled - keeping channel deleted`, 'info');
                }
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for channel deletion: ${error.message}`);

            
            if (AntiNukeManager.isChannelRecoveryEnabled()) {
                const restored = await restoreDeletedChannel(channel.guild, channelMetadata);
                Logger.warn(`🔄 Emergency channel restoration: ${restored ? 'SUCCESS' : 'FAILED'} - Audit logs unavailable`, 'warning');
            } else {
                Logger.info(`🔄 Auto-recovery disabled - keeping emergency channel deleted`, 'info');
            }
        }
    }
};


async function restoreDeletedChannel(guild, metadata) {
    try {
        
        await RateLimitManager.execute(
            `guild.${guild.id}.channels.create.recovery`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay()); 

                
                const channelOptions = {
                    type: metadata.type,
                    topic: metadata.topic,
                    nsfw: metadata.nsfw,
                    position: metadata.position,
                    reason: metadata.reason
                };

                
                if (metadata.type === 'voice') {
                    channelOptions.bitrate = metadata.bitrate;
                    channelOptions.userLimit = metadata.userLimit;
                } else if (metadata.type === 'text') {
                    channelOptions.rateLimitPerUser = metadata.rateLimitPerUser;
                }

                
                const restoredChannel = await guild.channels.create(
                    metadata.name,
                    channelOptions
                );

                
                if (metadata.parentId) {
                    try {
                        await restoredChannel.setParent(metadata.parentId);
                    } catch (error) {
                    }
                }


                if (metadata.permissionOverwrites && metadata.permissionOverwrites.length > 0) {
                    try {
                        const permissions = metadata.permissionOverwrites.map(overwrite => ({
                            id: overwrite.id,
                            allow: overwrite.allow,
                            deny: overwrite.deny
                        }));

                        await restoredChannel.overwritePermissions(permissions);
                    } catch (error) {
                    }
                }

                Logger.success(`✅ Restored channel #${restoredChannel.name} (${restoredChannel.id})`);
                return restoredChannel;
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        return true;

    } catch (error) {
        Logger.error(`Failed to restore channel #${metadata.name}: ${error.message}`);
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