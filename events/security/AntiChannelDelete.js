import AntiNukeManager from "../../utils/AntiNukeManager.js";
import RateLimitManager from "../../utils/RateLimitManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "channelDelete",
  once: false,
  async execute(client, channel) {
    if (!channel.guild) return;
    if (AntiNukeManager.shouldIgnoreEvent(channel.guild.id, "SYSTEM")) return;

    Logger.warn(
      `Channel deleted: #${channel.name} (${channel.id}) in ${channel.guild.name}`
    );

    const channelMetadata = {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
      nsfw: channel.nsfw,
      bitrate: channel.bitrate,
      userLimit: channel.userLimit,
      rateLimitPerUser: channel.rateLimitPerUser,
      position: channel.position,
      parentId: channel.parentId,
      permissionOverwrites: channel.permissionOverwrites.cache.map(
        (overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield,
        })
      ),
      reason: "[AntiNuke] Channel restored after malicious deletion",
    };

    try {
      const auditLogs = await channel.guild.fetchAuditLogs({
        type: 12,
        limit: 1,
      });
      const deleteEntry = auditLogs.entries.find(
        (entry) =>
          entry.target?.id === channel.id &&
          Date.now() - entry.createdTimestamp < 30000
      );

      if (deleteEntry && deleteEntry.executor) {
        const executor = deleteEntry.executor;
        Logger.warn(`Channel deleted by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) {
          Logger.info(
            `Channel deletion by whitelisted user ${executor.tag} - not saving metadata`
          );
          return;
        }

        db.saveDeletedChannel(channel.guild.id, channel.id, channelMetadata);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "channelDeletions",
          executor.id,
          channel.guild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`CHANNEL DELETION THRESHOLD EXCEEDED`);
          const timeWindow =
            global.config?.antinuke_settings?.time_window || 36000000;
          const userDeletedChannels = db.getDeletedChannels(
            channel.guild.id,
            timeWindow
          );
          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            channel.guild.id,
            `Mass channel deletion - ${userDeletedChannels.length} channels`
          );

          if (executorPunished && AntiNukeManager.isChannelRecoveryEnabled()) {
            Logger.warn(
              `Restoring ${userDeletedChannels.length} deleted channels`
            );
            const restorePromises = userDeletedChannels.map((row) =>
              restoreDeletedChannel(channel.guild, row.metadata)
            );
            const restoreResults = await Promise.allSettled(restorePromises);
            const successCount = restoreResults.filter(
              (r) => r.status === "fulfilled"
            ).length;
            Logger.success(
              `Channel restoration: ${successCount}/${userDeletedChannels.length} succeeded`
            );
            if (successCount > 0) db.clearDeletedChannels(channel.guild.id);
          }

          AntiNukeManager.cleanupActionData(
            "channelDeletions",
            executor.id,
            channel.guild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify channel deleter from audit logs`);
        db.saveDeletedChannel(channel.guild.id, channel.id, channelMetadata);
        if (AntiNukeManager.isChannelRecoveryEnabled()) {
          await restoreDeletedChannel(channel.guild, channelMetadata);
        }
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
      db.saveDeletedChannel(channel.guild.id, channel.id, channelMetadata);
      if (AntiNukeManager.isChannelRecoveryEnabled()) {
        await restoreDeletedChannel(channel.guild, channelMetadata);
      }
    }
  },
};

async function restoreDeletedChannel(guild, metadata) {
  try {
    await RateLimitManager.execute(
      `guild.${guild.id}.channels.create.recovery`,
      async () => {
        await new Promise((r) =>
          setTimeout(r, AntiNukeManager.getRecoveryDelay())
        );
        const channelOptions = {
          type: metadata.type,
          topic: metadata.topic,
          nsfw: metadata.nsfw,
          position: metadata.position,
          reason: metadata.reason,
        };

        if (metadata.type === "voice") {
          channelOptions.bitrate = metadata.bitrate;
          channelOptions.userLimit = metadata.userLimit;
        } else if (metadata.type === "text") {
          channelOptions.rateLimitPerUser = metadata.rateLimitPerUser;
        }

        const restoredChannel = await guild.channels.create(
          metadata.name,
          channelOptions
        );

        if (metadata.parentId) {
          try {
            await restoredChannel.setParent(metadata.parentId);
          } catch (e) {}
        }

        if (metadata.permissionOverwrites?.length > 0) {
          try {
            const permissions = metadata.permissionOverwrites.map((o) => ({
              id: o.id,
              allow: o.allow,
              deny: o.deny,
            }));
            await restoredChannel.overwritePermissions(permissions);
          } catch (e) {}
        }

        Logger.success(`Restored channel #${restoredChannel.name}`);
        return restoredChannel;
      },
      [],
      { retryLimit: 3, initialBackoff: 2000 }
    );
    return true;
  } catch (error) {
    Logger.error(
      `Failed to restore channel #${metadata.name}: ${error.message}`
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
