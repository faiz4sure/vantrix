import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "roleCreate",
  once: false,
  async execute(client, role) {
    const guild = role.guild;
    if (!AntiNukeManager.isProtectedServer(guild.id)) return;

    Logger.warn(`Role created: @${role.name} (${role.id}) in ${guild.name}`);

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 30, limit: 5 });
      const createEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === role.id &&
          entry.executor &&
          Date.now() - entry.createdTimestamp < 30000
      );

      if (createEntry && createEntry.executor) {
        const executor = createEntry.executor;
        Logger.warn(`Role created by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveCreatedRole(guild.id, role.id);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "roleCreations",
          executor.id,
          guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`ROLE CREATION THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const createdRoleIds = db.getCreatedRoles(guild.id, timeWindow);

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass role creation - ${createdRoleIds.length} roles`
          );

          if (AntiNukeManager.isRoleRecoveryEnabled()) {
            Logger.warn(`Deleting ${createdRoleIds.length} created roles`);
            const deletePromises = createdRoleIds.map((roleId) =>
              deleteCreatedRole(guild, roleId)
            );
            const deleteResults = await Promise.allSettled(deletePromises);
            const successCount = deleteResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Role deletion: ${successCount}/${createdRoleIds.length}`
            );
            if (successCount > 0) db.clearCreatedRoles(guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "roleCreations",
            executor.id,
            guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify role creator from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function deleteCreatedRole(guild, roleId) {
  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;

    await RateLimitManager.execute(
      `guild.${guild.id}.roles.delete.recovery`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        await role.delete("[AntiNuke] Unauthorized role creation");
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    Logger.success(`Deleted created role @${role.name}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to delete role: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
