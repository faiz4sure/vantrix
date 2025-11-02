

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';


const createdChannelsCache = new Map();

export default {
    name: 'channelCreate',
    once: false, 
    async execute(client, channel) {
        
        if (!channel.guild) return;

        
        if (AntiNukeManager.shouldIgnoreEvent(channel.guild.id, 'SYSTEM')) {
            return; 
        }

        Logger.warn(`📺 Channel created: #${channel.name} (${channel.id}) in ${channel.guild.name}`, 'warning');

        
        const channelMetadata = {
            id: channel.id,
            name: channel.name,
            createdAt: Date.now()
        };

        
        const cacheKey = `${channel.guild.id}`;

        if (!createdChannelsCache.has(cacheKey)) {
            createdChannelsCache.set(cacheKey, []);
        }
        createdChannelsCache.get(cacheKey).push(channelMetadata);

        
        if (createdChannelsCache.get(cacheKey).length > 100) {
            createdChannelsCache.set(cacheKey, createdChannelsCache.get(cacheKey).slice(-100));
        }


        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: 10, 
                limit: 1
            });

            const createEntry = auditLogs.entries.find(entry =>
                entry.target?.id === channel.id &&
                (Date.now() - entry.createdTimestamp) < 30000 
            );

            if (createEntry && createEntry.executor) {
                const executor = createEntry.executor;
                Logger.warn(`👤 Channel created by: ${executor.tag} (${executor.id})`, 'warning');

                
                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }


                const thresholdExceeded = AntiNukeManager.recordAction(
                    'channelCreations',
                    executor.id,
                    channel.guild.id,
                    false 
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 CHANNEL CREATION THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    
                    const userCreatedChannels = createdChannelsCache.get(cacheKey)?.filter(
                        meta => (Date.now() - meta.createdAt) < 60000 
                    ) || [channelMetadata];

                    
                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        channel.guild.id,
                        `Mass channel creation detected - Created ${userCreatedChannels.length} channels`
                    );

                    
                    let channelsDeleted = 0;
                    if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - deleting ${userCreatedChannels.length} created channels`, 'warning');

                        
                        const deletePromises = userCreatedChannels.map(meta =>
                            deleteCreatedChannelById(channel.guild, meta)
                        );

                        const deleteResults = await Promise.allSettled(deletePromises);
                        const successfulDeletes = deleteResults.filter(r => r.status === 'fulfilled').length;
                        const failedDeletes = deleteResults.filter(r => r.status === 'rejected').length;

                        channelsDeleted = successfulDeletes;
                        Logger.success(`🔄 Channel deletion: ${successfulDeletes} succeeded, ${failedDeletes} failed`);

                        if (successfulDeletes > 0) {

                            createdChannelsCache.delete(cacheKey);
                        }

                    } else if (!executorPunished) {
                        Logger.info(`🔄 Punishment failed - not attempting channel deletion`, 'info');
                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping created channels`, 'info');
                    }

                    
                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('channelCreations', executor.id, channel.guild.id);
                    } else {

                        AntiNukeManager.cleanupActionData('channelCreations', executor.id, channel.guild.id);
                    }

                    
                    Logger.success(`⚔️ Anti-channel creation operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Channels created: ${userCreatedChannels.length}`);
                    Logger.success(`Channels deleted: ${channelsDeleted}`);

                    
                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                
                Logger.warn(`⚠️ Could not identify channel creator from audit logs`, 'warning');

                
                if (AntiNukeManager.isChannelRecoveryEnabled()) {
                    const channelDeleted = await deleteCreatedChannel(channel);
                    Logger.warn(`🗑️ Channel ${channelDeleted ? 'deleted' : 'could not be deleted'} as safety measure`, 'warning');
                } else {
                    Logger.info(`🔄 Auto-recovery disabled - Unknown channel #${channel.name} left untouched`, 'info');
                }
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for channel creation: ${error.message}`);

            
            if (AntiNukeManager.isChannelRecoveryEnabled()) {
                const channelDeleted = await deleteCreatedChannel(channel);
                Logger.warn(`🗑️ Emergency channel deletion: ${channelDeleted ? 'SUCCESS' : 'FAILED'} - Audit logs unavailable`, 'warning');
            } else {
                Logger.info(`🔄 Auto-recovery disabled - Emergency channel #${channel.name} left untouched`, 'info');
            }
        }
    }
};


async function deleteCreatedChannelById(guild, metadata) {
    try {
        
        const channel = guild.channels.cache.get(metadata.id);

        if (!channel) {
            return false;
        }


        await RateLimitManager.execute(
            `guild.${guild.id}.channels.delete.recovery`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay()); 
                await channel.delete('[AntiNuke] Unauthorized channel creation detected');
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        Logger.success(`✅ Deleted created channel #${channel.name} (${channel.id})`);
        return true;

    } catch (error) {
        Logger.error(`Failed to delete created channel #${metadata.name}: ${error.message}`);
        return false;
    }
}


async function deleteCreatedChannel(channel) {
    try {
        
        await RateLimitManager.execute(
            `guild.${channel.guild.id}.channels.delete.${channel.id}`,
            async () => await channel.delete('[AntiNuke] Unauthorized channel creation detected'),
            [],
            { retryLimit: 3 }
        );

        Logger.success(`✅ Deleted channel #${channel.name} (${channel.id})`);
        return true;

    } catch (error) {
        Logger.error(`Failed to delete channel #${channel.name}: ${error.message}`);
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