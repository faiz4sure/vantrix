

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';


const recentKicksCache = new Map();

export default {
    name: 'guildMemberRemove',
    once: false, 
    async execute(client, member) {
        const guild = member.guild;
        const kickedUser = member.user;

        
        if (kickedUser.bot) return;

        
        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return; 
        }

        Logger.debug(`👢 User left/kicked: ${kickedUser.tag} (${kickedUser.id}) from ${guild.name}`, 'warning');

        
        if (!recentKicksCache.has(guild.id)) {
            recentKicksCache.set(guild.id, new Map());
        }

        const guildCache = recentKicksCache.get(guild.id);

        
        try {
            const auditLogs = await RateLimitManager.execute(
                `guild.${guild.id}.auditLogs.kicks`,
                async () => await guild.fetchAuditLogs({
                    type: 20, 
                    limit: 1
                }),
                [],
                { retryLimit: 2, initialBackoff: 1000 }
            );

            const kickEntry = auditLogs.entries.find(entry =>
                entry.target?.id === kickedUser.id &&
                entry.executor && 
                (Date.now() - entry.createdTimestamp) < 30000 
            );

            
            if (kickEntry && kickEntry.executor) {
                const executor = kickEntry.executor;
                Logger.warn(`👤 User kicked by: ${executor.tag} (${executor.id})`, 'warning');

                
                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const kickData = {
                    userId: kickedUser.id,
                    userTag: kickedUser.tag,
                    kickerId: executor.id,
                    kickedAt: Date.now(),
                    roles: member.roles.cache.map(role => ({
                        id: role.id,
                        name: role.name,
                        position: role.position
                    })),
                    joinedAt: member.joinedAt,
                    reason: kickEntry.reason || 'No reason provided'
                };

                guildCache.set(kickedUser.id, kickData);

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'kicks',
                    executor.id,
                    guild.id,
                    false 
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 MASS KICK THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    
                    const recentlyKicked = Array.from(guildCache.values()).filter(
                        kick => kick.kickerId === executor.id &&
                               (Date.now() - kick.kickedAt) < 60000
                    );

                    
                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass kicking detected - Kicked ${recentlyKicked.length} users`
                    );

                    
                    if (executorPunished && AntiNukeManager.isKickRecoveryEnabled()) {
                        Logger.warn(`🔄 Kick recovery enabled - sending re-add invites to ${recentlyKicked.length} recently kicked users`, 'warning');

                        
                        const reAddPromises = recentlyKicked.map(kickData =>
                            reAddMember(guild, kickData)
                        );

                        const reAddResults = await Promise.allSettled(reAddPromises);
                        const successfulReAdds = reAddResults.filter(r => r.status === 'fulfilled').length;
                        const failedReAdds = reAddResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Re-add recovery: ${successfulReAdds} succeeded, ${failedReAdds} failed`);

                        if (successfulReAdds > 0) {

                            recentlyKicked.forEach(kick => guildCache.delete(kick.userId));
                        }

                    } else if (executorPunished && !AntiNukeManager.isKickRecoveryEnabled()) {
                        Logger.info(`🔄 Kick recovery disabled - not sending re-add invites (configurable via recover_kicks)`, 'info');

                    } else {
                        Logger.info(`🔄 Punishment failed - not attempting re-adding as safety measure`, 'info');

                        AntiNukeManager.cleanupActionData('kicks', executor.id, guild.id);
                    }

                    if (executorPunished) {

                        AntiNukeManager.cleanupActionData('kicks', executor.id, guild.id);
                    }


                    
                    Logger.success(`⚔️ Anti-mass kick operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Users kicked: ${recentlyKicked.length}`);
                    Logger.success(`Users re-added: ${executorPunished ? recentlyKicked.length : 0}`);

                    
                    AntiNukeManager.markOperationComplete(executor.id);
                }
            } else {
                
                Logger.debug(`ℹ️ User ${kickedUser.tag} left voluntarily or kick not identifiable`, 'debug');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for kick: ${error.message}`, 'error');
        }

        const now = Date.now();
        for (const [guildId, guildKicks] of recentKicksCache.entries()) {
            for (const [userId, kickData] of guildKicks.entries()) {
                if ((now - kickData.kickedAt) > 300000) {
                    guildKicks.delete(userId);
                }
            }

            if (guildKicks.size === 0) {
                recentKicksCache.delete(guildId);
            }
        }
    }
};


async function reAddMember(guild, kickData) {
    try {
        Logger.debug(`🔄 Attempting to re-add ${kickData.userTag} (${kickData.userId}) to ${guild.name}`);

        
        let invite = null;

        
        const textChannel = guild.channels.cache.find(
            channel => channel.type === 'GUILD_TEXT' &&
                      guild.members.me?.permissionsIn(channel).has('CREATE_INSTANT_INVITE')
        );

        if (textChannel) {
            try {
                invite = await RateLimitManager.execute(
                    `guild.${guild.id}.channels.createInvite.${textChannel.id}`,
                    async () => await textChannel.createInvite({
                        maxAge: 86400,
                        maxUses: 1,
                        temporary: false,
                        reason: `[AntiNuke] Emergency re-add for mass kick victim ${kickData.userTag}`
                    }),
                    [],
                    { retryLimit: 2, initialBackoff: 1000 }
                );

                Logger.debug(`✅ Created temporary invite for re-adding ${kickData.userTag}`);
            } catch (error) {
                Logger.debug(`⚠️ Could not create invite for re-adding ${kickData.userTag}: ${error.message}`);
            }
        }

        if (invite) {
            
            try {
                const user = await global.client.users.fetch(kickData.userId);

                
                try {
                    await RateLimitManager.execute(
                        `users.${kickData.userId}.send`,
                        async () => {
                            try {
                                return await user.send(
                                    `🛡️ **ANTI-NUKE PROTECTION**\n\n` +
                                    `You were kicked from **${guild.name}** by a mass kicker.\n\n` +
                                    `**Emergency Re-add:** ${invite.url}\n\n` +
                                    `This invite will expire in 24 hours.\n\n` +
                                    `*Original kick reason: ${kickData.reason}*`
                                );
                            } catch (dmError) {
                                
                                if (dmError.code === 50007) {
                                    Logger.debug(`⚠️ User ${kickData.userTag} has DMs disabled (Code: 50007)`);
                                    throw new Error('DM_DISABLED'); 
                                }
                                throw dmError; 
                            }
                        },
                        [],
                        { retryLimit: 1, initialBackoff: 500 }
                    );

                    Logger.success(`✅ Sent emergency re-add invite to ${kickData.userTag}`);
                    return true;

                } catch (dmError) {
                    if (dmError.message === 'DM_DISABLED') {
                        
                        Logger.debug(`ℹ️ User ${kickData.userTag} has DMs disabled - invite created for manual use`);
                        Logger.info(`🔗 Emergency re-add invite for ${kickData.userTag}: ${invite.url}`);
                        return false; 
                    } else {
                        
                        Logger.debug(`⚠️ Could not DM invite to ${kickData.userTag}: ${dmError.message}`);
                        Logger.info(`🔗 Emergency re-add invite for ${kickData.userTag}: ${invite.url}`);
                        return false;
                    }
                }

            } catch (fetchError) {
                Logger.debug(`⚠️ Could not fetch user ${kickData.userTag} for DM: ${fetchError.message}`);
                Logger.info(`🔗 Emergency re-add invite (user fetch failed): ${invite.url}`);
                return false;
            }
        } else {
            Logger.debug(`⚠️ Could not create invite for re-adding ${kickData.userTag} - insufficient permissions`);
            return false;
        }

    } catch (error) {
        Logger.error(`Failed to re-add ${kickData.userTag} (${kickData.userId}): ${error.message}`);
        return false;
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */