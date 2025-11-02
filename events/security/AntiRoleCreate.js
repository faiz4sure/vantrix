import AntiNukeManager from '../../utils/AntiNukeManager.js';
import RateLimitManager from '../../utils/RateLimitManager.js';
import Logger from '../../utils/Logger.js';

const createdRolesCache = new Map();

export default {
    name: 'roleCreate',
    once: false,
    async execute(client, role) {
        const guild = role.guild;

        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return;
        }

        Logger.warn(`⚔️ Role created: @${role.name} (${role.id}) in ${guild.name}`, 'warning');

        const roleMetadata = {
            id: role.id,
            name: role.name,
            createdAt: Date.now()
        };

        const cacheKey = `${guild.id}`;

        if (!createdRolesCache.has(cacheKey)) {
            createdRolesCache.set(cacheKey, []);
        }
        createdRolesCache.get(cacheKey).push(roleMetadata);

        if (createdRolesCache.get(cacheKey).length > 100) {
            createdRolesCache.set(cacheKey, createdRolesCache.get(cacheKey).slice(-100));
        }

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: 30,
                limit: 5
            });

            const createEntry = auditLogs.entries.find(entry =>
                entry.target?.id === role.id &&
                entry.executor &&
                (Date.now() - entry.createdTimestamp) < 30000
            );

            if (createEntry && createEntry.executor) {
                const executor = createEntry.executor;
                Logger.warn(`👤 Role created by: ${executor.tag} (${executor.id})`, 'warning');

                if (AntiNukeManager.shouldIgnore(executor.id)) {
                    return;
                }

                const thresholdExceeded = AntiNukeManager.recordAction(
                    'roleCreations',
                    executor.id,
                    guild.id,
                    false
                );

                if (thresholdExceeded) {
                    Logger.warn(`🚨 ROLE CREATION THRESHOLD EXCEEDED - Executing anti-spam protection`, 'warning');

                    const userCreatedRoles = createdRolesCache.get(cacheKey)?.filter(
                        meta => (Date.now() - meta.createdAt) < 60000
                    ) || [roleMetadata];

                    const executorPunished = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Mass role creation detected - Created ${userCreatedRoles.length} roles`
                    );

                    let rolesDeleted = 0;
                    if (AntiNukeManager.isRoleRecoveryEnabled()) {
                        Logger.warn(`🔄 Auto-recovery enabled - deleting ${userCreatedRoles.length} created roles`, 'warning');

                        const deletePromises = userCreatedRoles.map(meta =>
                            deleteCreatedRoleById(guild, meta)
                        );

                        const deleteResults = await Promise.allSettled(deletePromises);
                        const successfulDeletes = deleteResults.filter(r => r.status === 'fulfilled').length;
                        const failedDeletes = deleteResults.filter(r => r.status === 'rejected').length;

                        rolesDeleted = successfulDeletes;
                        Logger.success(`🔄 Role deletion: ${successfulDeletes} succeeded, ${failedDeletes} failed`);

                        if (successfulDeletes > 0) {
                            createdRolesCache.delete(cacheKey);
                        }

                    } else {
                        Logger.info(`🔄 Auto-recovery disabled - keeping created roles`, 'info');
                    }

                    if (!executorPunished) {
                        Logger.warn(`⚠️ Punishment failed - cleaning up accumulated actions to prevent threshold inflation`, 'warning');
                        AntiNukeManager.cleanupActionData('roleCreations', executor.id, guild.id);
                    } else {
                        AntiNukeManager.cleanupActionData('roleCreations', executor.id, guild.id);
                    }

                    Logger.success(`⚔️ Anti-role creation operation completed:`);
                    Logger.success(`Executor processed: ${executorPunished ? 'PUNISHED' : 'SPARED'} (${executor.tag})`);
                    Logger.success(`Roles created: ${userCreatedRoles.length}`);
                    Logger.success(`Roles deleted: ${rolesDeleted}`);

                    AntiNukeManager.markOperationComplete(executor.id);
                }

            } else {
                Logger.warn(`⚠️ Could not identify role creator from audit logs`, 'warning');
                Logger.info(`🔄 Recovery unavailable - unable to verify role creator for @${role.name}`, 'info');
            }

        } catch (error) {
            Logger.error(`Failed to fetch audit logs for role creation: ${error.message}`, 'error');
        }
    }
};

async function deleteCreatedRoleById(guild, metadata) {
    try {
        const role = guild.roles.cache.get(metadata.id);

        if (!role) {
            return false;
        }

        await RateLimitManager.execute(
            `guild.${guild.id}.roles.delete.recovery`,
            async () => {
                await sleep(AntiNukeManager.getRecoveryDelay());
                await role.delete('[AntiNuke] Unauthorized role creation detected');
            },
            [],
            { retryLimit: 3, initialBackoff: 2000 }
        );

        Logger.success(`✅ Deleted created role @${role.name} (${role.id})`);
        return true;

    } catch (error) {
        Logger.error(`Failed to delete created role @${metadata.name}: ${error.message}`);
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