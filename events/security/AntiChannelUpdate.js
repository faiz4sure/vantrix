import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "channelUpdate",
  once: false,
  async execute(client, oldChannel, newChannel) {
    if (!newChannel.guild) return;
    if (AntiNukeManager.shouldIgnoreEvent(newChannel.guild.id, "SYSTEM"))
      return;

    Logger.warn(
      `Channel updated: #${oldChannel.name} → #${newChannel.name} (${newChannel.id}) in ${newChannel.guild.name}`
    );

    const originalMetadata = {
      id: oldChannel.id,
      name: oldChannel.name,
      type: oldChannel.type,
      topic: oldChannel.topic,
      nsfw: oldChannel.nsfw,
      bitrate: oldChannel.bitrate,
      userLimit: oldChannel.userLimit,
      rateLimitPerUser: oldChannel.rateLimitPerUser,
      position: oldChannel.position,
      parentId: oldChannel.parentId,
      permissionOverwrites: oldChannel.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.toArray(),
        deny: o.deny.toArray(),
      })),
    };

    try {
      const auditTypes = [11, 14, 13, 15];
      let updateEntry = null;

      for (const type of auditTypes) {
        try {
          const auditLogs = await newChannel.guild.fetchAuditLogs({
            type,
            limit: 1,
          });
          const entry = auditLogs.entries.find(
            (e) =>
              e.target?.id === newChannel.id &&
              e.executor &&
              Date.now() - e.createdTimestamp < 30000
          );
          if (entry) {
            updateEntry = entry;
            break;
          }
        } catch (e) {}
      }

      if (updateEntry && updateEntry.executor) {
        const executor = updateEntry.executor;
        Logger.warn(`Channel updated by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveOriginalChannel(
          newChannel.guild.id,
          newChannel.id,
          originalMetadata
        );

        const thresholdExceeded = AntiNukeManager.recordAction(
          "channelUpdates",
          executor.id,
          newChannel.guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`CHANNEL UPDATE THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const recentUpdates = db.getOriginalChannels(
            newChannel.guild.id,
            timeWindow
          );

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            newChannel.guild.id,
            `Mass channel update - ${recentUpdates.length} channels`
          );

          if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
            Logger.warn(`Restoring ${recentUpdates.length} channels`);
            const restorePromises = recentUpdates.map((d) =>
              restoreChannelToOriginal(
                newChannel.guild.channels.cache.get(d.channelId),
                d.metadata
              )
            );
            const restoreResults = await Promise.allSettled(restorePromises);
            const successCount = restoreResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Channel restoration: ${successCount}/${recentUpdates.length}`
            );
            if (successCount > 0) db.clearOriginalChannels(newChannel.guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "channelUpdates",
            executor.id,
            newChannel.guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify channel updater from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function restoreChannelToOriginal(currentChannel, originalData) {
  if (!currentChannel) return false;
  try {
    await RateLimitManager.execute(
      `guild.${currentChannel.guild.id}.channels.restore.${currentChannel.id}`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        await currentChannel.edit({
          name: originalData.name,
          topic: originalData.topic,
          nsfw: originalData.nsfw,
          bitrate: originalData.bitrate,
          userLimit: originalData.userLimit,
          rateLimitPerUser: originalData.rateLimitPerUser,
          position: originalData.position,
          reason: "[AntiNuke] Reverting channel updates",
        });
        if (originalData.parentId)
          await currentChannel.setParent(originalData.parentId).catch(() => {});
        if (originalData.permissionOverwrites?.length > 0) {
          await currentChannel.permissionOverwrites
            .set(
              originalData.permissionOverwrites.map((o) => ({
                id: o.id,
                allow: o.allow,
                deny: o.deny,
                type: o.type,
              })),
              "[AntiNuke] Reverting permission changes"
            )
            .catch(() => {});
        }
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    Logger.success(`Restored channel #${originalData.name}`);
    return true;
  } catch (error) {
    Logger.error(
      `Failed to restore channel #${originalData.name}: ${error.message}`
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
