import Logger from "./Logger.js";
import WhitelistManager from "./WhitelistManager.js";
import RateLimitManager from "./RateLimitManager.js";
import * as db from "./db.js";

class AntiNukeManager {
  constructor() {
    this.activeOperations = new Map();
    setInterval(() => this.cleanupStaleOperations(), 30000);
  }

  isProtectedServer(guildId) {
    return global.config?.protectedServer === guildId;
  }

  shouldIgnore(userId) {
    return this.isBot(userId) || WhitelistManager.shouldBypass(userId);
  }

  isBot(userId) {
    return userId === global.client?.user?.id;
  }

  isAutoRecoveryEnabled() {
    return global.config?.antinuke_settings?.auto_recovery === true;
  }

  isChannelRecoveryEnabled() {
    return (
      global.config?.antinuke_settings?.recover_channels === true &&
      this.isAutoRecoveryEnabled()
    );
  }

  isRoleRecoveryEnabled() {
    return (
      global.config?.antinuke_settings?.recover_roles === true &&
      this.isAutoRecoveryEnabled()
    );
  }

  isKickRecoveryEnabled() {
    return global.config?.antinuke_settings?.recover_kicks === true;
  }

  getRecoveryDelay() {
    return global.config?.antinuke_settings?.recovery_delay || 1500;
  }

  cleanupActionData(actionType, userId, guildId) {
    db.clearUserActions(userId, guildId, actionType);
  }

  recordAction(actionType, userId, guildId, forceThreshold = false) {
    if (this.isUserBeingProcessed(userId)) {
      Logger.debug(
        `User ${userId} already being processed - skipping ${actionType}`
      );
      return false;
    }

    const timeWindow =
      global.config?.antinuke_settings?.time_window || 36000000;
    db.recordAction(userId, guildId, actionType);
    const actionCount = db.countActions(
      userId,
      guildId,
      actionType,
      timeWindow
    );

    const thresholds = global.config?.antinuke_settings || {};
    let actionKey = actionType;

    if (actionType === "channelDeletions") actionKey = "channel_delete_limit";
    else if (actionType === "channelCreations")
      actionKey = "channel_create_limit";
    else if (actionType === "channelUpdates")
      actionKey = "channel_update_limit";
    else if (actionType === "roleDeletions") actionKey = "role_delete_limit";
    else if (actionType === "roleCreations") actionKey = "role_create_limit";
    else if (actionType === "memberUpdates") actionKey = "member_update_limit";
    else if (actionType === "bans") actionKey = "ban_limit";
    else if (actionType === "kicks") actionKey = "kick_limit";
    else if (actionType === "unbans") actionKey = "unban_limit";
    else if (actionType === "botAdditions") actionKey = "bot_add_limit";

    const threshold = thresholds[actionKey] || 5;
    const thresholdExceeded = forceThreshold || actionCount >= threshold;

    if (thresholdExceeded) {
      Logger.warn(
        `Threshold exceeded by ${userId} (${actionCount}/${threshold}) for ${actionType}`
      );
      this.markUserAsBeingProcessed(userId, actionType, guildId);
    }

    this.sendThresholdWebhook(
      userId,
      guildId,
      actionType,
      actionCount,
      threshold
    );
    return thresholdExceeded;
  }

  async sendThresholdWebhook(
    userId,
    guildId,
    actionType,
    currentCount,
    threshold
  ) {
    const webhookUrl = global.config?.logs?.log_webhook;
    if (!webhookUrl || webhookUrl.length < 8) return;

    try {
      const guild = global.client.guilds.cache.get(guildId);
      const user = await global.client.users.fetch(userId).catch(() => null);
      const percentage = Math.round((currentCount / threshold) * 100);
      const statusText =
        currentCount >= threshold ? "⚠️ THRESHOLD EXCEEDED" : "⚡ MONITORING";

      const { WebhookClient, MessageEmbed } = await import(
        "discord.js-selfbot-v13"
      );
      const embed = new MessageEmbed()
        .setTitle(`🚨 Anti-Nuke Alert - ${statusText}`)
        .setDescription(
          `**Server**: ${guild ? guild.name : guildId}\n**User**: ${
            user ? user.tag : userId
          }\n**Action**: ${actionType
            .replace(/([A-Z])/g, " $1")
            .toLowerCase()}\n**Progress**: ${currentCount}/${threshold} (${percentage}%)\n**Status**: ${
            currentCount >= threshold ? "ACTION TAKEN" : "APPROACHING THRESHOLD"
          }`
        )
        .setColor(0x8b5cf6)
        .setThumbnail(
          user?.displayAvatarURL({ dynamic: true, size: 128 }) || null
        )
        .setTimestamp()
        .setFooter({ text: "Vantrix" });

      await RateLimitManager.execute(
        "webhook.threshold",
        async () => {
          const webhook = new WebhookClient({ url: webhookUrl });
          await webhook.send({ embeds: [embed], username: "Vantrix" });
          webhook.destroy();
        },
        [],
        { retryLimit: 2, initialBackoff: 2000 }
      );
    } catch (error) {
      Logger.debug(`Webhook notification failed: ${error.message}`);
    }
  }

  async sendPunishmentWebhook(
    guild,
    member,
    actionMessage,
    wasPunished,
    reason
  ) {
    const webhookUrl = global.config?.logs?.log_webhook;
    if (!webhookUrl || webhookUrl.length < 8) return;

    try {
      const punishmentType =
        global.config?.antinuke_settings?.punishment || "ban";
      const { WebhookClient, MessageEmbed } = await import(
        "discord.js-selfbot-v13"
      );
      const embed = new MessageEmbed()
        .setTitle(
          wasPunished
            ? `🛡️ Anti-Nuke Action Taken`
            : `⚠️ Anti-Nuke Activity Detected`
        )
        .setDescription(
          `**Server**: ${guild.name}\n**Target**: ${member.user.tag}\n**Action**: ${actionMessage}\n**Reason**: ${reason}\n**Punishment Type**: ${punishmentType}`
        )
        .setColor(0xff0000)
        .setThumbnail(
          member.user.displayAvatarURL({ dynamic: true, size: 128 })
        )
        .setTimestamp()
        .setFooter({ text: "Vantrix" });

      await RateLimitManager.execute(
        "webhook.punishment",
        async () => {
          const webhook = new WebhookClient({ url: webhookUrl });
          await webhook.send({ embeds: [embed], username: "Vantrix" });
          webhook.destroy();
        },
        [],
        { retryLimit: 2, initialBackoff: 2000 }
      );
    } catch (error) {
      Logger.debug(`Webhook notification failed: ${error.message}`);
    }
  }

  async sendHierarchyBlockedWebhook(guild, member, attemptedAction, reason) {
    const webhookUrl = global.config?.logs?.log_webhook;
    if (!webhookUrl || webhookUrl.length < 8) return;

    try {
      const botMember = guild.members.me;
      const botRolePos = botMember?.roles.highest?.position || 0;
      const targetRolePos = member.roles.highest.position;
      const { WebhookClient, MessageEmbed } = await import(
        "discord.js-selfbot-v13"
      );
      const embed = new MessageEmbed()
        .setTitle(`🚫 Anti-Nuke Protection - Hierarchy Block`)
        .setDescription(
          `**Server**: ${guild.name}\n**Target**: ${member.user.tag}\n**Attempted Action**: ${attemptedAction}\n**Reason**: ${reason}\n**Block Reason**: Role hierarchy protection\n**Bot Role Position**: ${botRolePos}\n**Target Role Position**: ${targetRolePos}\n**Status**: User spared - threshold still counted`
        )
        .setColor(0xf59e0b)
        .setThumbnail(
          member.user.displayAvatarURL({ dynamic: true, size: 128 })
        )
        .setTimestamp()
        .setFooter({ text: "Vantrix - Hierarchy Protection" });

      await RateLimitManager.execute(
        "webhook.hierarchy",
        async () => {
          const webhook = new WebhookClient({ url: webhookUrl });
          await webhook.send({ embeds: [embed], username: "Vantrix" });
          webhook.destroy();
        },
        [],
        { retryLimit: 2, initialBackoff: 2000 }
      );
    } catch (error) {
      Logger.debug(`Hierarchy webhook failed: ${error.message}`);
    }
  }

  async punish(userId, guildId, reason) {
    try {
      const guild = global.client.guilds.cache.get(guildId);
      if (!guild) {
        Logger.error(`Cannot punish: Guild ${guildId} not found`);
        return false;
      }

      if (userId === global.client.user.id) {
        Logger.warn("Cannot punish self");
        return false;
      }

      if (WhitelistManager.isOwner(userId)) {
        Logger.warn(`Cannot punish owner ${userId}`);
        return false;
      }

      const punishment = global.config?.antinuke_settings?.punishment || "ban";
      const member = await RateLimitManager.execute(
        `guild.${guildId}.members.fetch.${userId}`,
        async () => await guild.members.fetch(userId),
        [],
        { retryLimit: 2 }
      ).catch(() => null);

      if (!member) {
        Logger.warn(`Cannot fetch member ${userId}`);
        return false;
      }

      const botMember = guild.members.me;
      if (!botMember) {
        Logger.error(`Cannot get bot member in ${guild.name}`);
        return false;
      }

      const requiredPerm =
        punishment === "ban" ? "BAN_MEMBERS" : "KICK_MEMBERS";
      if (
        !botMember.permissions.has(requiredPerm) &&
        !botMember.permissions.has("ADMINISTRATOR")
      ) {
        Logger.error(`Missing ${requiredPerm} permission in ${guild.name}`);
        return false;
      }

      if (member.roles.highest.position >= botMember.roles.highest.position) {
        Logger.error(`Cannot ${punishment} ${member.user.tag} - higher role`);
        await this.sendHierarchyBlockedWebhook(
          guild,
          member,
          `${punishment} blocked by hierarchy`,
          reason
        );
        return false;
      }

      const fullReason = `[AntiNuke] ${reason}`;
      let actionMessage = "";

      if (punishment === "ban") {
        await RateLimitManager.execute(
          `guild.${guildId}.members.ban`,
          async () => await member.ban({ reason: fullReason }),
          [],
          { retryLimit: 3 }
        );
        Logger.success(`Banned ${member.user.tag} (${member.id}): ${reason}`);
        actionMessage = "Banned";
      } else if (punishment === "kick") {
        await RateLimitManager.execute(
          `guild.${guildId}.members.kick`,
          async () => await member.kick(fullReason),
          [],
          { retryLimit: 3 }
        );
        Logger.success(`Kicked ${member.user.tag} (${member.id}): ${reason}`);
        actionMessage = "Kicked";
      } else if (punishment === "none") {
        Logger.warn(
          `Detected malicious activity: ${member.user.tag}: ${reason}`
        );
        actionMessage = "Detected (No Action)";
      } else {
        Logger.error(`Unknown punishment type: ${punishment}`);
        actionMessage = "Detected (Invalid Punishment Type)";
      }

      await this.sendPunishmentWebhook(
        guild,
        member,
        actionMessage,
        punishment !== "none",
        reason
      );
      if (actionMessage !== "Detected (Invalid Punishment Type)") {
        await this.notifyOwnersSafe(
          guild,
          member,
          actionMessage.toLowerCase().replace(" ", "_"),
          reason
        );
      }

      return true;
    } catch (error) {
      Logger.error(`Failed to punish ${userId}: ${error.message}`);
      return false;
    }
  }

  async notifyOwnersSafe(guild, member, action, reason) {
    if (global.config?.logs?.log_owner_dm !== true) return;

    const message = `🛡️ **ANTI-NUKE ACTION TAKEN**\n**Server:** ${
      guild.name
    }\n**User:** ${member.user.tag} (${
      member.id
    })\n**Action:** ${action.toUpperCase()}\n**Reason:** ${reason}\n**Time:** ${new Date().toISOString()}`;
    const owners = WhitelistManager.getAllOwners();

    for (const ownerId of owners) {
      try {
        const owner = await RateLimitManager.execute(
          `users.fetch.${ownerId}`,
          async () => await global.client.users.fetch(ownerId),
          [],
          { retryLimit: 1 }
        ).catch(() => null);
        if (!owner) continue;
        await RateLimitManager.execute(
          `users.${ownerId}.send`,
          async () => await owner.send(message),
          [],
          { retryLimit: 2 }
        );
      } catch (error) {}
    }
  }

  shouldIgnoreEvent(guildId, userId) {
    if (!this.isProtectedServer(guildId)) return true;
    if (this.shouldIgnore(userId)) return true;
    return false;
  }

  getStats() {
    return {
      activeOperations: {
        total: this.activeOperations.size,
        byStatus: Array.from(this.activeOperations.values()).reduce(
          (stats, op) => {
            stats[op.status || "unknown"] =
              (stats[op.status || "unknown"] || 0) + 1;
            return stats;
          },
          {}
        ),
      },
    };
  }

  isUserBeingProcessed(userId) {
    const operation = this.activeOperations.get(userId);
    if (!operation) return false;
    if (Date.now() - operation.startedAt > 300000) {
      this.activeOperations.delete(userId);
      return false;
    }
    return true;
  }

  markUserAsBeingProcessed(userId, actionType, guildId) {
    this.activeOperations.set(userId, {
      actionType,
      guildId,
      startedAt: Date.now(),
      status: "processing",
    });
  }

  markOperationComplete(userId) {
    const operation = this.activeOperations.get(userId);
    if (operation) {
      operation.status = "completed";
      operation.completedAt = Date.now();
      setTimeout(() => this.activeOperations.delete(userId), 30000);
    }
  }

  cleanupStaleOperations() {
    const now = Date.now();
    for (const [userId, operation] of this.activeOperations.entries()) {
      if (now - operation.startedAt > 300000) {
        this.activeOperations.delete(userId);
      }
    }
  }
}

const antiNukeManager = new AntiNukeManager();
export default antiNukeManager;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
