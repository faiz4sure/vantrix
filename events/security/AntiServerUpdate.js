import AntiNukeManager from "../../utils/AntiNukeManager.js";
import Logger from "../../utils/Logger.js";
import * as db from "../../utils/db.js";

export default {
  name: "guildUpdate",
  once: false,
  async execute(client, oldGuild, newGuild) {

    if (AntiNukeManager.shouldIgnoreEvent(newGuild.id, "SYSTEM")) return;

    const changes = {
      hasHarmful: false,
      props: [],
      nameChanged: false,
      iconChanged: false,
      bannerChanged: false,
      verificationChanged: false,
      explicitFilterChanged: false,
      notificationsChanged: false,
      mfaChanged: false,
    };

    if (oldGuild.name !== newGuild.name) {
      changes.nameChanged = true;
      changes.props.push("name");
      changes.hasHarmful = true;
    }
    if (oldGuild.icon !== newGuild.icon) {
      changes.iconChanged = true;
      changes.props.push("icon");
      changes.hasHarmful = true;
    }
    if (oldGuild.banner !== newGuild.banner) {
      changes.bannerChanged = true;
      changes.props.push("banner");
      changes.hasHarmful = true;
    }
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
      changes.verificationChanged = true;
      changes.props.push("verification");
      changes.hasHarmful = true;
    }
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
      changes.explicitFilterChanged = true;
      changes.props.push("explicit_filter");
      changes.hasHarmful = true;
    }
    if (
      oldGuild.defaultMessageNotifications !==
      newGuild.defaultMessageNotifications
    ) {
      changes.notificationsChanged = true;
      changes.props.push("notifications");
      changes.hasHarmful = true;
    }
    if (oldGuild.mfaLevel !== newGuild.mfaLevel) {
      changes.mfaChanged = true;
      changes.props.push("mfa");
      changes.hasHarmful = true;
    }

    if (!changes.hasHarmful) return;

    Logger.warn(
      `Server updated in ${newGuild.name} - Changes: ${changes.props.join(
        ", "
      )}`
    );

    const originalMetadata = {
      id: oldGuild.id,
      name: oldGuild.name,
      icon: oldGuild.icon,
      banner: oldGuild.banner,
      splash: oldGuild.splash,
      verificationLevel: oldGuild.verificationLevel,
      explicitContentFilter: oldGuild.explicitContentFilter,
      defaultMessageNotifications: oldGuild.defaultMessageNotifications,
      mfaLevel: oldGuild.mfaLevel,
      afkChannelId: oldGuild.afkChannelId,
      afkTimeout: oldGuild.afkTimeout,
      systemChannelId: oldGuild.systemChannelId,
    };

    try {
      const auditLogs = await newGuild.fetchAuditLogs({ type: 1, limit: 1 });
      const updateEntry = auditLogs.entries.find(
        (e) => e.executor && Date.now() - e.createdTimestamp < 30000
      );

      if (updateEntry && updateEntry.executor) {
        const executor = updateEntry.executor;
        Logger.warn(`Server updated by: ${executor.tag} (${executor.id})`);

        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        db.saveOriginalServer(newGuild.id, originalMetadata);

        const thresholdExceeded = AntiNukeManager.recordAction(
          "serverUpdates",
          executor.id,
          newGuild.id,
          false
        );

        if (thresholdExceeded) {
          Logger.warn(`SERVER UPDATE THRESHOLD EXCEEDED`);

          const executorPunished = await AntiNukeManager.punish(
            executor.id,
            newGuild.id,
            `Malicious server mod - ${changes.props.length} settings`
          );

          if (executorPunished) {
            Logger.warn(`Restoring server settings`);
            const originalData = db.getOriginalServer(newGuild.id);
            if (originalData) {
              const restorePromises = [
                changes.nameChanged
                  ? restoreSetting(
                      newGuild,
                      { name: originalData.name },
                      "name"
                    )
                  : null,
                changes.verificationChanged
                  ? restoreSetting(
                      newGuild,
                      { verificationLevel: originalData.verificationLevel },
                      "verification"
                    )
                  : null,
                changes.explicitFilterChanged
                  ? restoreSetting(
                      newGuild,
                      {
                        explicitContentFilter:
                          originalData.explicitContentFilter,
                      },
                      "explicit_filter"
                    )
                  : null,
                changes.notificationsChanged
                  ? restoreSetting(
                      newGuild,
                      {
                        defaultMessageNotifications:
                          originalData.defaultMessageNotifications,
                      },
                      "notifications"
                    )
                  : null,
                changes.mfaChanged
                  ? restoreSetting(
                      newGuild,
                      { mfaLevel: originalData.mfaLevel },
                      "mfa"
                    )
                  : null,
              ].filter(Boolean);
              const results = await Promise.allSettled(restorePromises);
              Logger.success(
                `Server restoration: ${
                  results.filter((r) => r.status === "fulfilled").length
                }/${restorePromises.length}`
              );
              db.deleteOriginalServer(newGuild.id);
            }
          }

          AntiNukeManager.cleanupActionData(
            "serverUpdates",
            executor.id,
            newGuild.id
          );
          AntiNukeManager.markOperationComplete(executor.id);
        }
      } else {
        Logger.warn(`Could not identify server updater from audit logs`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs: ${error.message}`);
    }
  },
};

async function restoreSetting(guild, settings, settingName) {
  try {
    await guild.edit({
      ...settings,
      reason: `[AntiNuke] Restoring ${settingName}`,
    });
    Logger.success(`Restored ${settingName}`);
    return true;
  } catch (error) {
    Logger.error(`Failed to restore ${settingName}: ${error.message}`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
