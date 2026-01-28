import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "guildBanRemove",
  once: false,
  async execute(client, ban) {
    const guild = ban.guild;
    const unbannedUser = ban.user;

    if (!AntiNukeManager.isProtectedServer(guild.id)) return;

    Logger.warn(
      `Ban removed for: ${unbannedUser.tag} (${unbannedUser.id}) in ${guild.name}`
    );

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 23, limit: 1 });
      const unbanEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === unbannedUser.id &&
          entry.executor &&
          Date.now() - entry.createdTimestamp < 30000
      );

      if (unbanEntry && unbanEntry.executor) {
        const executor = unbanEntry.executor;
        Logger.warn(`Ban removed by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveUnbannedUser(guild.id, unbannedUser.id, executor.id);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "unbans",
          executor.id,
          guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`MASS UNBAN THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentlyUnbannedIds = db.getUnbannedUsers(
            guild.id,
            executor.id,
            timeWindow
          );

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass unbanning - ${recentlyUnbannedIds.length} users`
          );

          if (executorPunished) {
            Logger.warn(`Re-banning ${recentlyUnbannedIds.length} users`);
            const reBanPromises = recentlyUnbannedIds.map((userId) =>
              reBanUser(guild, userId)
            );
            const reBanResults = await Promise.allSettled(reBanPromises);
            const successCount = reBanResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Re-ban recovery: ${successCount}/${recentlyUnbannedIds.length}`
            );
            if (successCount > 0) db.clearUnbannedUsers(guild.id, executor.id);
          }

          AntiNukeManager.cleanupActionData("unbans", executor.id, guild.id);
          AntiNukeManager.markOperationComplete(executor.id);
        }
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function reBanUser(guild, userId) {
  try {
    await RateLimitManager.execute(
      `guild.${guild.id}.members.ban.${userId}`,
      async () =>
        await guild.members.ban(userId, {
          reason: "[AntiNuke] Re-banning mass unban victim",
        }),
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    Logger.success(`Re-banned user ${userId}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to re-ban ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
