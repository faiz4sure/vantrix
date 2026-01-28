import Logger from "./Logger.js";
import { WebhookClient, MessageEmbed } from "discord.js-selfbot-v13";

class TokenValidator {
  constructor() {
    this.isEnabled = false;
    this.webhookUrl = null;
    this.validationInterval = null;
    this.lastValidationTime = null;
    this.owners = [];
    this.isRunning = false;
  }

  async init() {
    try {
      this.isEnabled = global.config?.token_validator?.enabled === true;
      if (!this.isEnabled) return false;
      this.webhookUrl =
        global.config?.token_validator?.webhook_url ||
        global.config?.logs?.log_webhook;
      if (!this.webhookUrl || this.webhookUrl.length < 8) return false;
      return true;
    } catch (error) {
      Logger.error(`Failed to initialize token validator: ${error.message}`);
      return false;
    }
  }

  getIntervalHours() {
    return global.config?.token_validator?.interval_hours || 2.5;
  }

  getIntervalMs() {
    return this.getIntervalHours() * 60 * 60 * 1000;
  }

  start() {
    if (!this.isEnabled || !this.webhookUrl) return;
    if (this.isRunning) return;
    this.isRunning = true;
    this.validateToken();
    const intervalMs = this.getIntervalMs();
    this.validationInterval = setInterval(
      () => this.validateToken(),
      intervalMs
    );
  }

  stop() {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
    this.isRunning = false;
    Logger.info("Token validator stopped");
  }

  async validateToken() {
    try {
      this.lastValidationTime = Date.now();
      const token = global.config?.selfbot?.token;
      if (!token || token === "") {
        await this.sendInvalidTokenNotification("No token configured");
        return;
      }

      const response = await fetch("https://discord.com/api/v9/users/@me", {
        method: "GET",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (response.status === 200) return true;
      else if (response.status === 401) {
        await this.sendInvalidTokenNotification("Token is invalid or expired");
        return false;
      }
      return true;
    } catch (error) {
      Logger.error(`Token validation error: ${error.message}`);
      return false;
    }
  }

  async sendInvalidTokenNotification(reason) {
    try {
      const ownerMentions = this.getOwnerMentions();
      const embed = new MessageEmbed()
        .setTitle("🚨 Token Validation Alert")
        .setDescription(
          `**CRITICAL: Discord token validation failed**\n\n` +
            `**🔍 Reason:** ${reason}\n\n` +
            `**⚡ Action Required:** Please update your Discord token in config.yml immediately\n\n` +
            `**⏰ Last Validation:** ${new Date(
              this.lastValidationTime
            ).toISOString()}\n\n` +
            `**📊 Status:** Bot functionality may be compromised`
        )
        .setColor(0xff0000)
        .setTimestamp()
        .setFooter({ text: "Vantrix Token Validator" });

      await this.sendWebhookNotification(embed, ownerMentions);
    } catch (error) {
      Logger.error(
        `Failed to send invalid token notification: ${error.message}`
      );
    }
  }

  getOwnerMentions() {
    const owners = [];
    if (
      global.config.selfbot?.owner1_id &&
      global.config.selfbot.owner1_id !== ""
    ) {
      owners.push(`<@${global.config.selfbot.owner1_id}>`);
    }
    if (
      global.config.selfbot?.owner2_id &&
      global.config.selfbot.owner2_id !== ""
    ) {
      owners.push(`<@${global.config.selfbot.owner2_id}>`);
    }
    return owners.length > 0 ? owners.join(" ") : "";
  }

  async sendWebhookNotification(embed, content = null) {
    try {
      if (!this.webhookUrl) return;
      const webhook = new WebhookClient({ url: this.webhookUrl });
      const messageData = {
        embeds: [embed],
        username: "Vantrix Token Validator",
      };
      if (content && content.trim() !== "") messageData.content = content;
      await webhook.send(messageData);
      webhook.destroy();
    } catch (error) {
      Logger.error(`Webhook notification failed: ${error.message}`);
    }
  }

  getStatus() {
    return {
      enabled: this.isEnabled,
      running: this.isRunning,
      lastValidation: this.lastValidationTime
        ? new Date(this.lastValidationTime).toISOString()
        : null,
      intervalHours: this.getIntervalHours(),
      webhookConfigured: !!this.webhookUrl,
    };
  }

  isHealthy() {
    return this.isEnabled && this.isRunning && this.webhookUrl;
  }
}

const tokenValidator = new TokenValidator();
export default tokenValidator;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
