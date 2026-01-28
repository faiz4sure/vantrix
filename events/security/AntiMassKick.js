import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "guildMemberRemove",
  once: false,
  async execute(client, member) {
    const guild = member.guild;
    const kickedUser = member.user;

    if (kickedUser.bot) return;
    if (!AntiNukeManager.isProtectedServer(guild.id)) return;

    Logger.debug(
      `User left/kicked: ${kickedUser.tag} (${kickedUser.id}) from ${guild.name}`,
    );

    try {
      const auditLogs = await guild.fetchAuditLogs({ type: 20, limit: 1 });

      const kickEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === kickedUser.id &&
          entry.executor &&
          Date.now() - entry.createdTimestamp < 30000,
      );

      if (kickEntry && kickEntry.executor) {
        const executor = kickEntry.executor;
        Logger.warn(`User kicked by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveKickedUser(guild.id, kickedUser.id, executor.id);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "kicks",
          executor.id,
          guild.id,
          false,
        );

        if (thresholdExceeded) {
          Logger.warn(`MASS KICK THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentlyKickedIds = db.getKickedUsers(
            guild.id,
            executor.id,
            timeWindow,
          );

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            guild.id,
            `Mass kicking - ${recentlyKickedIds.length} users`,
          );

          if (executorPunished && AntiNukeManager.isKickRecoveryEnabled()) {
            Logger.warn(
              `Sending re-add invites to ${recentlyKickedIds.length} users`,
            );
            const reAddPromises = recentlyKickedIds.map((userId) =>
              reAddMember(guild, userId),
            );
            const reAddResults = await Promise.allSettled(reAddPromises);
            const successCount = reAddResults.filter(
              (r) => r.status === "fulfilled",
            ).length;
            Logger.success(
              `Re-add recovery: ${successCount}/${recentlyKickedIds.length}`,
            );
            if (successCount > 0) db.clearKickedUsers(guild.id, executor.id);
          }

          AntiNukeManager.cleanupActionData("kicks", executor.id, guild.id);
          AntiNukeManager.markOperationComplete(executor.id);
        }
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function reAddMember(guild, userId) {
  try {
    const textChannel = guild.channels.cache.find(
      (ch) =>
        ch.type === "GUILD_TEXT" &&
        guild.members.me?.permissionsIn(ch).has("CREATE_INSTANT_INVITE"),
    );

    if (!textChannel) {
      Logger.debug(
        `Could not create invite for ${userId} - no suitable channel`,
      );
      return false;
    }

    const invite = await RateLimitManager.execute(
      `guild.${guild.id}.channels.createInvite.${textChannel.id}`,
      async () =>
        await textChannel.createInvite({
          maxAge: 86400,
          maxUses: 1,
          temporary: false,
          reason: `[AntiNuke] Emergency re-add for ${userId}`,
        }),
      [],
      { retryLimit: 2, initialBackoff: 1000 },
    );

    try {
      const user = await global.client.users.fetch(userId);
      await RateLimitManager.execute(
        `users.${userId}.send`,
        async () =>
          await user.send(
            `🛡️ **ANTI-NUKE PROTECTION**\n\n` +
              `You were kicked from **${guild.name}** by a mass kicker.\n\n` +
              `**Emergency Re-add:** ${invite.url}\n\n` +
              `This invite expires in 24 hours.`,
          ),
        [],
        { retryLimit: 1, initialBackoff: 500 },
      );
      Logger.success(`Sent re-add invite to ${userId}`);
      return true;
    } catch (dmError) {
      Logger.debug(`Could not DM ${userId}: ${dmError.message}`);
      Logger.info(`Emergency re-add invite for ${userId}: ${invite.url}`);
      return false;
    }
  } catch (error) {
    Logger.error(`Failed to re-add ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
