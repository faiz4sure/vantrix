import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "roleDelete",
  once: false,
  async execute(client, role) {
    const guild = role.guild;
    if (!guild) return;
    if (AntiNukeManager.shouldIgnoreEvent(guild.id, "SYSTEM")) return;

    Logger.warn(`Role deleted: @${role.name} (${role.id}) in ${guild.name}`);

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
      reason: "[AntiNuke] Role restored after malicious deletion",
    };

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 32, limit: 1 });
      const deleteEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === role.id &&
          Date.now() - entry.createdTimestamp < 30000
      );

      if (deleteEntry && deleteEntry.executor) {
        const executor = deleteEntry.executor;
        Logger.warn(`Role deleted by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) {
          Logger.info(
            `Role deletion by whitelisted user ${executor.tag} - not saving metadata`
          );
          return;
        }

        db.saveDeletedRole(guild.id, role.id, roleMetadata);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "roleDeletions",
          executor.id,
          guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`ROLE DELETION THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const userDeletedRoles = db.getDeletedRoles(guild.id, timeWindow);
          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass role deletion - ${userDeletedRoles.length} roles`
          );

          if (executorPunished && AntiNukeManager.isRoleRecoveryEnabled()) {
            Logger.warn(`Restoring ${userDeletedRoles.length} deleted roles`);
            const restorePromises = userDeletedRoles.map((row) =>
              restoreDeletedRole(guild, row.metadata)
            );
            const restoreResults = await Promise.allSettled(restorePromises);
            const successCount = restoreResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Role restoration: ${successCount}/${userDeletedRoles.length} succeeded`
            );
            if (successCount > 0) db.clearDeletedRoles(guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "roleDeletions",
            executor.id,
            guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify role deleter from audit logs`);
        db.saveDeletedRole(guild.id, role.id, roleMetadata);
        if (AntiNukeManager.isRoleRecoveryEnabled()) {
          await restoreDeletedRole(guild, roleMetadata);
        }
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
      db.saveDeletedRole(guild.id, role.id, roleMetadata);
      if (AntiNukeManager.isRoleRecoveryEnabled()) {
        await restoreDeletedRole(guild, roleMetadata);
      }
    }
  },
};

async function restoreDeletedRole(guild, metadata) {
  try {
    await RateLimitManager.execute(
      `guild.${guild.id}.roles.create.recovery`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        const roleOptions = {
          name: metadata.name,
          colors: { primaryColor: metadata.color },
          hoist: metadata.hoist,
          position: metadata.position,
          permissions: metadata.permissions,
          mentionable: metadata.mentionable,
          icon: metadata.icon,
          unicodeEmoji: metadata.unicodeEmoji,
          reason: metadata.reason,
        };

        const restoredRole = await guild.roles.create(roleOptions);
        Logger.success(`Restored role @${restoredRole.name}`);
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

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
