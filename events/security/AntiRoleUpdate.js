import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "roleUpdate",
  once: false,
  async execute(client, oldRole, newRole) {
    const guild = newRole.guild;
    if (!guild) return;
    if (AntiNukeManager.shouldIgnoreEvent(guild.id, "SYSTEM")) return;

    const changedProps = [];
    if (oldRole.name !== newRole.name) changedProps.push("name");
    if (oldRole.color !== newRole.color) changedProps.push("color");
    if (oldRole.hoist !== newRole.hoist) changedProps.push("hoist");
    if (oldRole.position !== newRole.position) changedProps.push("position");
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield)
      changedProps.push("permissions");
    if (oldRole.mentionable !== newRole.mentionable)
      changedProps.push("mentionable");
    if (oldRole.icon !== newRole.icon) changedProps.push("icon");
    if (oldRole.unicodeEmoji !== newRole.unicodeEmoji)
      changedProps.push("unicodeEmoji");

    if (changedProps.length === 0) return;

    Logger.warn(
      `Role updated: @${oldRole.name} → @${newRole.name} (${newRole.id}) in ${guild.name}`
    );
    Logger.warn(`Properties changed: ${changedProps.join(", ")}`);

    const originalMetadata = {
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
    };

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 31, limit: 5 });
      const updateEntry = auditLogs.entries.find(
        (e) =>
          e.target?.id === newRole.id &&
          e.executor &&
          Date.now() - e.createdTimestamp < 30000
      );

      if (updateEntry && updateEntry.executor) {
        const executor = updateEntry.executor;
        Logger.warn(`Role updated by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveOriginalRole(guild.id, newRole.id, originalMetadata);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "roleUpdates",
          executor.id,
          guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`ROLE UPDATE THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentUpdates = db.getOriginalRoles(guild.id, timeWindow);

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass role update - ${recentUpdates.length} roles`
          );

          if (executorPunished && AntiNukeManager.isRoleRecoveryEnabled()) {
            Logger.warn(`Restoring ${recentUpdates.length} roles`);
            const restorePromises = recentUpdates.map((d) =>
              restoreRoleToOriginal(guild.roles.cache.get(d.roleId), d.metadata)
            );
            const restoreResults = await Promise.allSettled(restorePromises);
            const successCount = restoreResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Role restoration: ${successCount}/${recentUpdates.length}`
            );
            if (successCount > 0) db.clearOriginalRoles(guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "roleUpdates",
            executor.id,
            guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify role updater from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function restoreRoleToOriginal(currentRole, originalData) {
  if (!currentRole) return false;
  try {
    await RateLimitManager.execute(
      `guild.${currentRole.guild.id}.roles.restore.${currentRole.id}`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        await currentRole.edit({
          name: originalData.name,
          colors: { primaryColor: originalData.color },
          hoist: originalData.hoist,
          position: originalData.position,
          permissions: originalData.permissions,
          mentionable: originalData.mentionable,
          icon: originalData.icon,
          unicodeEmoji: originalData.unicodeEmoji,
          reason: "[AntiNuke] Reverting role updates",
        });
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    Logger.success(`Restored role @${originalData.name}`);
    return true;
  } catch (error) {
    Logger.error(
      `Failed to restore role @${originalData.name}: ${error.message}`
    );
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
