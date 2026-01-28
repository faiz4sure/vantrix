import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "channelCreate",
  once: false,
  async execute(client, channel) {
    if (!channel.guild) return;
    if (AntiNukeManager.shouldIgnoreEvent(channel.guild.id, "SYSTEM")) return;

    Logger.warn(
      `Channel created: #${channel.name} (${channel.id}) in ${channel.guild.name}`
    );

    try {
      const auditLogs = await channel.guild.fetchAuditLogs({
        type: 10,
        limit: 1,
      });
      const createEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === channel.id &&
          Date.now() - entry.createdTimestamp < 30000
      );

      if (createEntry && createEntry.executor) {
        const executor = createEntry.executor;
        Logger.warn(`Channel created by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveCreatedChannel(channel.guild.id, channel.id);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "channelCreations",
          executor.id,
          channel.guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`CHANNEL CREATION THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const createdChannelIds = db.getCreatedChannels(
            channel.guild.id,
            timeWindow
          );

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            channel.guild.id,
            `Mass channel creation - ${createdChannelIds.length} channels`
          );

          if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
            Logger.warn(
              `Deleting ${createdChannelIds.length} created channels`
            );
            const deletePromises = createdChannelIds.map((channelId) =>
              deleteCreatedChannel(channel.guild, channelId)
            );
            const deleteResults = await Promise.allSettled(deletePromises);
            const successCount = deleteResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Channel deletion: ${successCount}/${createdChannelIds.length}`
            );
            if (successCount > 0) db.clearCreatedChannels(channel.guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "channelCreations",
            executor.id,
            channel.guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify channel creator from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function deleteCreatedChannel(guild, channelId) {
  try {
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return false;

    await RateLimitManager.execute(
      `guild.${guild.id}.channels.delete.recovery`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        await channel.delete("[AntiNuke] Unauthorized channel creation");
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    Logger.success(`Deleted created channel #${channel.name}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to delete channel: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
