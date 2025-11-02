import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const originalMembersCache = new Map();

export default {
    name: 'guildMemberUpdate',
    once: false,
    async execute(client, oldMember, newMember) {
        const guild = newMember.guild;

        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return;
        }

        const roleChange = detectRoleChanges(oldMember, newMember);

        if (!roleChange.hasChanges) {
            return;
        }

        Logger.warn(`👤 Member roles updated: ${newMember.user.tag} (${newMember.id}) in ${guild.name}`, 'warning');

        if (roleChange.added.length > 0) {
            Logger.warn(`⚠️ Roles added: ${roleChange.added.map(r => r.name).join(', ')}`, 'warning');
        }

        if (roleChange.removed.length > 0) {
            Logger.warn(`⚠️ Roles removed: ${roleChange.removed.map(r => r.name).join(', ')}`, 'warning');
        }

        if (roleChange.ignoredAdded.length > 0) {
            Logger.info(`ℹ️ Ignored roles added (skipped): ${roleChange.ignoredAdded.map(r => r.name).join(', ')}`, 'info');
        }

        if (roleChange.ignoredRemoved.length > 0) {
            Logger.info(`ℹ️ Ignored roles removed (skipped): ${roleChange.ignoredRemoved.map(r => r.name).join(', ')}`, 'info');
        }

        if (!originalMembersCache.has(guild.id)) {
            originalMembersCache.set(guild.id, new Map());
        }

        const guildCache = originalMembersCache.get(guild.id);

        if (!guildCache.has(newMember.id)) {
            const originalData = {
                id: oldMember.id,
                roles: oldMember.roles.cache.map(role => ({
                    id: role.id,
                    name: role.name,
                    position: role.position
                })),
                timeoutUntil: oldMember.communicationDisabledUntil,
                updatedAt: Date.now()
            };
            guildCache.set(newMember.id, originalData);
        }

        try {
            const auditLogs = await RateLimitManager.execute(
                `guild.${guild.id}.auditLogs.memberUpdates`,
                async () => await guild.fetchAuditLogs({
                    type: 25,
                    limit: 5
                }),
                [],
                { retryLimit: 2, initialBackoff: 1000 }
            );

            const updateEntry = auditLogs.entries.find(entry => {
                const isTargetMember = entry.target?.id === newMember.id;
                const hasExecutor = !!entry.executor;
                const isRecent = entry.createdTimestamp && (Date.now() - entry.createdTimestamp) < 30000;

                const changes = entry.changes || [];
                const hasRelevantChanges = changes.some(change => {
                    return roleChange.hasChanges && (change.key === '$add' || change.key === '$remove');
                });

                return isTargetMember && hasExecutor && isRecent && hasRelevantChanges;
            });

            if (updateEntry && updateEntry.executor) {
                const executor = updateEntry.executor;
                Logger.warn(`👤 Member modified by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    const updatedData = {
                        id: newMember.id,
                        roles: newMember.roles.cache.map(role => ({
                            id: role.id,
                            name: role.name,
                            position: role.position
                        })),
                        timeoutUntil: newMember.communicationDisabledUntil,
                        updatedAt: Date.now()
                    };
                    guildCache.set(newMember.id, updatedData);
                    return;
                }

                let actionType = 'memberUpdates';

                const thresholdExceeded = AntiNukeManager.recordAction(
                    actionType,
                    executor.id,
                    guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 MEMBER UPDATE THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    const recentUpdates = Array.from(guildCache.values()).filter(
                        data => (Date.now() - data.updatedAt) < 60000
                    );

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass member modification detected - Modified ${recentUpdates.length} members`
                    );

                    if (executorPunished) {
                        Logger.warn(`🔄 Member restoration enabled - reverting harmful modifications for ${recentUpdates.length} members`, 'warning');

                        const restorePromises = recentUpdates.map(data =>
                            restoreMemberToOriginal(guild.members.cache.get(data.id), data)
                        );

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled').length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Member restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        if (successfulRestores > 0) {
                            recentUpdates.forEach(data => guildCache.delete(data.id));
                        }

                    } else {
                        Logger.info(`🔄 Punishment failed - not attempting member restoration as safety measure`, 'info');

                        AntiNukeManager.cleanupActionData(actionType, executor.id, guild.id);
                    }

                    if (executorPunished) {
                        AntiNukeManager.cleanupActionData(actionType, executor.id, guild.id);
                    }

                    Logger.success(`⚔️ Anti-member modification operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Members modified: ${recentUpdates.length}`);
                    Logger.success(`Members restored: ${executorPunished ? recentUpdates.length : 0}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.debug(`ℹ️ Could not identify member modifier from audit logs for ${newMember.user.tag}`, 'debug');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for member update: ${error.message}`, 'error');
        }

        const now = Date.now();
        for (const [guildId, guildCache] of originalMembersCache.entries()) {
            for (const [memberId, memberData] of guildCache.entries()) {
                if ((now - memberData.updatedAt) > 300000) {
                    guildCache.delete(memberId);
                }
            }

            if (guildCache.size === 0) {
                originalMembersCache.delete(guildId);
            }
        }
    }
};

function detectRoleChanges(oldMember, newMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const added = newRoles.filter(role => !oldRoles.has(role.id));
    const removed = oldRoles.filter(role => !newRoles.has(role.id));

    const ignoredRoleIds = global.config?.antinuke_settings?.ignored_role_ids || [];
    const validIgnoredIds = ignoredRoleIds.filter(id => id && id.trim() !== '');

    const nonIgnoredAdded = added.filter(role => !validIgnoredIds.includes(role.id));
    const nonIgnoredRemoved = removed.filter(role => !validIgnoredIds.includes(role.id));

    return {
        hasChanges: nonIgnoredAdded.size > 0 || nonIgnoredRemoved.size > 0,
        added: Array.from(nonIgnoredAdded.values()),
        removed: Array.from(nonIgnoredRemoved.values()),
        ignoredAdded: Array.from(added.filter(role => validIgnoredIds.includes(role.id)).values()),
        ignoredRemoved: Array.from(removed.filter(role => validIgnoredIds.includes(role.id)).values())
    };
}


async function restoreMemberToOriginal(currentMember, originalData) {
    try {
        if (!currentMember) {
            return false;
        }

        await RateLimitManager.execute(
            `guild.${currentMember.guild.id}.members.restore.${currentMember.id}`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay());

                const originalRoleIds = originalData.roles.map(r => r.id);
                await currentMember.roles.set(originalRoleIds, '[AntiNuke] Reverting malicious role modifications');

                Logger.success(`✅ Restored member ${currentMember.user.tag} to original state`);
                return currentMember;
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        return true;

    } catch (error) {
        Logger.error(`Failed to restore member ${originalData.id}: ${error.message}`);
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