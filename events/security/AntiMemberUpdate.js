import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "guildMemberUpdate",
  once: false,
  async execute(client, oldMember, newMember) {
    const guild = newMember.guild;
    if (!AntiNukeManager.isProtectedServer(guild.id)) return;

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const added = newRoles.filter((r) => !oldRoles.has(r.id));
    const removed = oldRoles.filter((r) => !newRoles.has(r.id));
    const ignoredIds = (
      global.config?.antinuke_settings?.ignored_role_ids || []
    ).filter((id) => id?.trim());
    const nonIgnoredAdded = added.filter((r) => !ignoredIds.includes(r.id));
    const nonIgnoredRemoved = removed.filter((r) => !ignoredIds.includes(r.id));

    if (nonIgnoredAdded.size === 0 && nonIgnoredRemoved.size === 0) return;

    Logger.warn(
      `Member roles updated: ${newMember.user.tag} (${newMember.id}) in ${guild.name}`,
    );
    if (nonIgnoredAdded.size > 0)
      Logger.warn(
        `Roles added: ${Array.from(nonIgnoredAdded.values())
          .map((r) => r.name)
          .join(", ")}`,
      );
    if (nonIgnoredRemoved.size > 0)
      Logger.warn(
        `Roles removed: ${Array.from(nonIgnoredRemoved.values())
          .map((r) => r.name)
          .join(", ")}`,
      );

    const originalRoleIds = oldMember.roles.cache.map((r) => r.id);

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 25, limit: 5 });

      const updateEntry = auditLogs.entries.find(
        (e) =>
          e.target?.id === newMember.id &&
          e.executor &&
          Date.now() - e.createdTimestamp < 30000 &&
          e.changes?.some((c) => c.key === "$add" || c.key === "$remove"),
      );

      if (updateEntry && updateEntry.executor) {
        const executor = updateEntry.executor;
        Logger.warn(`Member modified by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveOriginalMember(guild.id, newMember.id, originalRoleIds);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "memberUpdates",
          executor.id,
          guild.id,
          false,
        );

        if (thresholdExceeded) {
          Logger.warn(`MEMBER UPDATE THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentUpdates = db.getOriginalMembers(guild.id, timeWindow);

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass member modification - ${recentUpdates.length} members`,
          );

          if (executorPunished) {
            Logger.warn(`Restoring ${recentUpdates.length} members`);
            const restorePromises = recentUpdates.map((d) =>
              restoreMemberToOriginal(
                guild.members.cache.get(d.memberId),
                d.roleIds,
              ),
            );
            const restoreResults = await Promise.allSettled(restorePromises);
            const successCount = restoreResults.filter(
              (r) => r.status === "fulfilled",
            ).length;
            Logger.success(
              `Member restoration: ${successCount}/${recentUpdates.length}`,
            );
            if (successCount > 0) db.clearOriginalMembers(guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "memberUpdates",
            executor.id,
            guild.id,
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function restoreMemberToOriginal(currentMember, originalRoleIds) {
  if (!currentMember) return false;
  try {
    await RateLimitManager.execute(
      `guild.${currentMember.guild.id}.members.restore.${currentMember.id}`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay()),
        );
        await currentMember.roles.set(
          originalRoleIds,
          "[AntiNuke] Reverting role modifications",
        );
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 },
    );
    Logger.success(`Restored member ${currentMember.user.tag}`);
    return true;
  } catch (error) {
    Logger.error(
      `Failed to restore member ${currentMember?.id}: ${error.message}`,
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
