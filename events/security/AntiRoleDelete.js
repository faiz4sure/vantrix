import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const deletedRolesCache = new Map();

export default {
    name: 'roleDelete',
    once: false,
    async execute(client, role) {
        const guild = role.guild;

        if (!guild) return;

        if (AntiNukeManager.shouldIgnoreEvent(guild.id, 'SYSTEM')) {
            return;
        }

        Logger.warn(`🗑️ Role deleted: @${role.name} (${role.id}) in ${guild.name}`, 'warning');

        const roleMetadata = {
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions.bitfield,
            mentionable: role.mentionable,
            icon: role.icon,
            unicodeEmoji: role.unicodeEmoji,
            managed: role.managed,
            reason: '[AntiNuke] Role restored after malicious deletion',
            deletedAt: Date.now()
        };

        const cacheKey = `${guild.id}`;

        if (!deletedRolesCache.has(cacheKey)) {
            deletedRolesCache.set(cacheKey, []);
        }
        deletedRolesCache.get(cacheKey).push(roleMetadata);

        if (deletedRolesCache.get(cacheKey).length > 100) {
            deletedRolesCache.set(cacheKey, deletedRolesCache.get(cacheKey).slice(-100));
        }

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: 32,
                limit: 1
            });

            const deleteEntry = auditLogs.entries.find(entry =>
                entry.target?.id === role.id &&
                (Date.now() - entry.createdTimestamp) < 30000
            );

            if (deleteEntry && deleteEntry.executor) {
                const executor = deleteEntry.executor;
                Logger.warn(`👤 Role deleted by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'roleDeletions',
                    executor.id,
                    guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 ROLE DELETION THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    const userDeletedRoles = deletedRolesCache.get(cacheKey)?.filter(
                        meta => (Date.now() - meta.deletedAt) < 60000
                    ) || [roleMetadata];

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass role deletion detected - Deleted ${userDeletedRoles.length} roles`
                    );

                    if (executorPunished && AntiNukeManager.isRoleRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - restoring ${userDeletedRoles.length} deleted roles`, 'warning');

                        const restorePromises = userDeletedRoles.map(meta =>
                            restoreDeletedRole(guild, meta)
                        );

                        const restoreResults = await Promise.allSettled(restorePromises);
                        const successfulRestores = restoreResults.filter(r => r.status === 'fulfilled').length;
                        const failedRestores = restoreResults.filter(r => r.status === 'rejected').length;

                        Logger.success(`🔄 Role restoration: ${successfulRestores} succeeded, ${failedRestores} failed`);

                        if (successfulRestores > 0) {
                            deletedRolesCache.delete(cacheKey);
                        }

                    } else if (!executorPunished) {
                        Logger.info(`🔄 Punishment failed - not attempting role restoration`, 'info');
                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping roles deleted`, 'info');
                    }

                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('roleDeletions', executor.id, guild.id);
                    } else {
                        AntiNukeManager.cleanupActionData('roleDeletions', executor.id, guild.id);
                    }

                    Logger.success(`⚔️ Anti-role deletion operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Roles deleted: ${userDeletedRoles.length}`);
                    Logger.success(`Roles restored: ${executorPunished && AntiNukeManager.isRoleRecoveryEnabled() ? userDeletedRoles.length : 0}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.warn(`⚠️ Could not identify role deleter from audit logs`, 'warning');

                if (AntiNukeManager.isRoleRecoveryEnabled()) {
                    const restored = await restoreDeletedRole(guild, roleMetadata);
                    Logger.warn(`🔄 Role ${restored ? 'restored' : 'could not be restored'} as safety measure`, 'warning');
                } else {
                    Logger.info(`🔄 Auto-recovery disabled - keeping role deleted`, 'info');
                }
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for role deletion: ${error.message}`);

            if (AntiNukeManager.isRoleRecoveryEnabled()) {
                const restored = await restoreDeletedRole(guild, roleMetadata);
                Logger.warn(`🔄 Emergency role restoration: ${restored ? 'SUCCESS' : 'FAILED'} - Audit logs unavailable`, 'warning');
            } else {
                Logger.info(`🔄 Auto-recovery disabled - keeping emergency role deleted`, 'info');
            }
        }
    }
};

async function restoreDeletedRole(guild, metadata) {
    try {
        await RateLimitManager.execute(
            `guild.${guild.id}.roles.create.recovery`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay());

                const roleOptions = {
                    name: metadata.name,
                    color: metadata.color,
                    hoist: metadata.hoist,
                    position: metadata.position,
                    permissions: metadata.permissions,
                    mentionable: metadata.mentionable,
                    icon: metadata.icon,
                    unicodeEmoji: metadata.unicodeEmoji,
                    reason: metadata.reason
                };

                const restoredRole = await guild.roles.create(roleOptions);

                Logger.success(`✅ Restored role @${restoredRole.name} (${restoredRole.id})`);
                return restoredRole;
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        return true;

    } catch (error) {
        Logger.error(`Failed to restore role @${metadata.name}: ${error.message}`);
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