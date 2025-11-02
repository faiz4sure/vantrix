import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const originalRolesCache = new Map();

export default {
    name: 'roleUpdate',
    once: false,
    async execute(client, oldRole, newRole) {
        const guild = newRole.guild;

        if (!guild) return;

        if (AntiNukeManager.shouldIgnoreEvent(guild.id, 'SYSTEM')) {
            return;
        }

        const roleChange = detectRoleChanges(oldRole, newRole);
        if (!roleChange.hasChanges) {
            return;
        }

        Logger.warn(`📝 Role updated: @${oldRole.name} → @${newRole.name} (${newRole.id}) in ${guild.name}`, 'warning');

        if (roleChange.changedProperties.length > 0) {
            Logger.warn(`⚠️ Properties changed: ${roleChange.changedProperties.join(', ')}`, 'warning');
        }

        if (!originalRolesCache.has(guild.id)) {
            originalRolesCache.set(guild.id, new Map());
        }

        const guildCache = originalRolesCache.get(guild.id);

        if (!guildCache.has(newRole.id)) {
            const originalData = {
                id: oldRole.id,
                name: oldRole.name,
                color: oldRole.color,
                hoist: oldRole.hoist,
                position: oldRole.position,
                permissions: oldRole.permissions.bitfield,
                mentionable: oldRole.mentionable,
                icon: oldRole.icon,
                unicodeEmoji: oldRole.unicodeEmoji,
                managed: oldRole.managed,
                editedAt: Date.now()
            };
            guildCache.set(newRole.id, originalData);
        }

        try {
            if (!guild) {
                Logger.warn(`⚠️ Guild not available for role ${newRole.id}`);
                return;
            }

            async function fetchAuditLogs(type) {
                try {
                    const auditLogs = await guild.fetchAuditLogs({
                        type: type,
                        limit: 5
                    });

                    return auditLogs;
                } catch (error) {
                    Logger.error(`❌ Audit log fetch failed for type ${type}: ${error.message}`);
                    return null;
                }
            }

            let updateEntry = null;
            const auditTypes = [31];

            for (const type of auditTypes) {
                const auditLogs = await fetchAuditLogs(type);
                if (!auditLogs) {
                    continue;
                }

                const entry = auditLogs.entries.find(entry => {
                    const targetId = entry.target?.id;
                    const executorExists = !!entry.executor;
                    const isRecent = entry.createdTimestamp && (Date.now() - entry.createdTimestamp) < 30000;

                    return targetId === newRole.id &&
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
                Logger.warn(`👤 Role updated by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    const updatedData = {
                        id: newRole.id,
                        name: newRole.name,
                        color: newRole.color,
                        hoist: newRole.hoist,
                        position: newRole.position,
                        permissions: newRole.permissions.bitfield,
                        mentionable: newRole.mentionable,
                        icon: newRole.icon,
                        unicodeEmoji: newRole.unicodeEmoji,
                        managed: newRole.managed,
                        editedAt: Date.now()
                    };
                    guildCache.set(newRole.id, updatedData);
                    return;
                }

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'roleUpdates',
                    executor.id,
                    guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 ROLE UPDATE THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    const recentUpdates = Array.from(guildCache.values()).filter(
                        data => (Date.now() - data.editedAt) < 60000
                    );

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass role update detected - Updated ${recentUpdates.length} roles`
                    );

                    if (executorPunished && AntiNukeManager.isRoleRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - restoring original settings for ${recentUpdates.length} roles`, 'warning');

                        const restorePromises = recentUpdates.map(data =>
                            restoreRoleToOriginal(guild.roles.cache.get(data.id) || null, data)
                        );

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled').length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Role restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        if (successfulRestores > 0) {
                            recentUpdates.forEach(data => guildCache.delete(data.id));
                        }

                    } else if (!executorPunished) {
                        Logger.info(`🔄 Punishment failed - not attempting role restoration`, 'info');
                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping role updates`, 'info');
                    }

                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('roleUpdates', executor.id, guild.id);
                    } else {
                        AntiNukeManager.cleanupActionData('roleUpdates', executor.id, guild.id);
                    }

                    Logger.success(`⚔️ Anti-role update operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Roles updated: ${recentUpdates.length}`);
                    Logger.success(`Roles restored: ${executorPunished && AntiNukeManager.isRoleRecoveryEnabled() ? recentUpdates.length : 0}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.warn(`⚠️ Could not identify role updater from audit logs`, 'warning');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for role update: ${error.message}`, 'error');
        }

        const now = Date.now();
        for (const [guildId, guildCache] of originalRolesCache.entries()) {
            for (const [roleId, roleData] of guildCache.entries()) {
                if ((now - roleData.editedAt) > 300000) {
                    guildCache.delete(roleId);
                }
            }

            if (guildCache.size === 0) {
                originalRolesCache.delete(guildId);
            }
        }
    }
};

function detectRoleChanges(oldRole, newRole) {
    const changedProperties = [];

    if (oldRole.name !== newRole.name) changedProperties.push('name');
    if (oldRole.color !== newRole.color) changedProperties.push('color');
    if (oldRole.hoist !== newRole.hoist) changedProperties.push('hoist');
    if (oldRole.position !== newRole.position) changedProperties.push('position');
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changedProperties.push('permissions');
    if (oldRole.mentionable !== newRole.mentionable) changedProperties.push('mentionable');
    if (oldRole.icon !== newRole.icon) changedProperties.push('icon');
    if (oldRole.unicodeEmoji !== newRole.unicodeEmoji) changedProperties.push('unicodeEmoji');

    return {
        hasChanges: changedProperties.length > 0,
        changedProperties: changedProperties
    };
}

async function restoreRoleToOriginal(currentRole, originalData) {
    try {
        if (!currentRole) {
            return false;
        }

        await RateLimitManager.execute(
            `guild.${currentRole.guild.id}.roles.restore.${currentRole.id}`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay());

                await currentRole.edit({
                    name: originalData.name,
                    color: originalData.color,
                    hoist: originalData.hoist,
                    position: originalData.position,
                    permissions: originalData.permissions,
                    mentionable: originalData.mentionable,
                    icon: originalData.icon,
                    unicodeEmoji: originalData.unicodeEmoji,
                    reason: '[AntiNuke] Reverting malicious role updates'
                });

                Logger.success(`✅ Restored role @${currentRole.name} to original settings`);
                return currentRole;
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        return true;

    } catch (error) {
        Logger.error(`Failed to restore role @${originalData.name}: ${error.message}`);
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