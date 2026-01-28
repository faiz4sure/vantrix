import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "guildBanAdd",
  once: false,
  async execute(client, ban) {
    const guild = ban.guild;
    const bannedUser = ban.user;

    if (!AntiNukeManager.isProtectedServer(guild.id)) return;

    Logger.warn(
      `User banned: ${bannedUser.tag} (${bannedUser.id}) in ${guild.name}`,
    );

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 22, limit: 1 });

      const banEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === bannedUser.id &&
          entry.executor &&
          Date.now() - entry.createdTimestamp < 30000,
      );

      if (banEntry && banEntry.executor) {
        const executor = banEntry.executor;
        Logger.warn(`User banned by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveBannedUser(guild.id, bannedUser.id, executor.id);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "bans",
          executor.id,
          guild.id,
          false,
        );

        if (thresholdExceeded) {
          Logger.warn(`MASS BAN THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentlyBannedIds = db.getBannedUsers(
            guild.id,
            executor.id,
            timeWindow,
          );

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass banning - ${recentlyBannedIds.length} users`,
          );

          if (executorPunished) {
            Logger.warn(`Unbanning ${recentlyBannedIds.length} users`);
            const unbanPromises = recentlyBannedIds.map((userId) =>
              unbanUser(guild, userId),
            );
            const unbanResults = await Promise.allSettled(unbanPromises);
            const successCount = unbanResults.filter(
              (r) => r.status === "fulfilled",
            ).length;
            Logger.success(
              `Unban recovery: ${successCount}/${recentlyBannedIds.length}`,
            );
            if (successCount > 0) db.clearBannedUsers(guild.id, executor.id);
          }

          AntiNukeManager.cleanupActionData("bans", executor.id, guild.id);
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify banning user from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function unbanUser(guild, userId) {
  try {
    await RateLimitManager.execute(
      `guild.${guild.id}.members.unban.${userId}`,
      async () =>
        await guild.members.unban(
          userId,
          "[AntiNuke] Unbanning mass ban victim",
        ),
      [],
      { retryLimit: 3, initialBackoff: 2000 },
    );
    Logger.success(`Unbanned user ${userId}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to unban ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
