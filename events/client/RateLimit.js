import Logger from "../../utils/Logger.js";
import { WebhookClient, MessageEmbed } from "discord.js-selfbot-v13";
export default {
  name: "rateLimit",
  once: false,
  async execute(client, rateLimitData) {
    const {
      timeout,
      limit,
      method,
      path,
      route,
      global: isGlobal,
    } = rateLimitData;

    const logMessage = `[RATE LIMIT] ${
      isGlobal ? "GLOBAL" : "Route"
    } | ${method} ${route} | Timeout: ${timeout}ms | Limit: ${limit}`;
    Logger.warn(logMessage);

    await sendRateLimitWebhook(rateLimitData);
  },
};
async function sendRateLimitWebhook(rateLimitData) {
  const webhookUrl = global.config?.logging?.log_webhook;
  if (!webhookUrl || webhookUrl.length < 8) return;

  const {
    timeout,
    limit,
    method,
    path,
    route,
    global: isGlobal,
  } = rateLimitData;

  const timeoutSeconds = (timeout / 1000).toFixed(2);
  const resetTime = new Date(Date.now() + timeout).toLocaleTimeString();

  try {
    const embed = new MessageEmbed()
      .setTitle(
        isGlobal ? "🚨 Global Rate Limit Hit" : "⚠️ Route Rate Limit Hit"
      )
      .setDescription(
        `**Type**: ${
          isGlobal ? "GLOBAL (All requests blocked)" : "Route-Specific"
        }\n` +
          `**Method**: \`${method}\`\n` +
          `**Route**: \`${route}\`\n` +
          `**Path**: \`${path}\`\n` +
          `**Timeout**: \`${timeoutSeconds}s\` (${timeout}ms)\n` +
          `**Limit**: \`${limit}\` requests\n` +
          `**Resets At**: \`${resetTime}\``
      )
      .setColor(isGlobal ? 0xff0000 : 0xffa500)
      .setFooter({ text: "Vantrix Anti-Nuke • Rate Limit Monitor" })
      .setTimestamp();

    const webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({ embeds: [embed], username: "Vantrix Rate Limit" });
    webhook.destroy();
  } catch (error) {
    Logger.debug(`Failed to send rate limit webhook: ${error.message}`);
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
