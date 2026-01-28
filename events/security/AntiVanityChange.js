import AntiNukeManager from "../../utils/AntiNukeManager.js";
import Logger from "../../utils/Logger.js";
// import { inspect } from "util";
// import { writeFileSync } from "fs";

export default {
  name: "guildUpdate",
  once: false,
  async execute(oldGuild, newGuild) {
    // writeFileSync(
    //   "data/oldGuild.txt",
    //   inspect(oldGuild, { depth: 5, colors: false }),
    // );
    // writeFileSync(
    //   "data/newGuild.txt",
    //   inspect(newGuild, { depth: 5, colors: false }),
    // );
    // Logger.debug(
    //   "guild objects written",
    // );
    if (!global.vanityCooldowns) global.vanityCooldowns = new Map();
    const guildId = newGuild.id;
    const now = Date.now();
    if (!AntiNukeManager.isProtectedServer(guildId)) return;

    const oldVanity = oldGuild.vanityURLCode;
    const newVanity = newGuild.vanityURLCode;
    let revertToVanity = oldVanity;

    if (
      (oldVanity === null || oldVanity === undefined) &&
      global.config?.vanity_reversion?.fallback_vanity
    ) {
      const fallback = global.config.vanity_reversion.fallback_vanity.trim();
      if (fallback) revertToVanity = fallback;
    }

    const vanityMode = global.config?.vanity_mode || "normal";
    if (vanityMode === "audit") return;
    if (revertToVanity === newVanity) return;
    if (!revertToVanity && !newVanity) return;

    if (vanityMode === "fast") {
      const cooldownKey = `vanity_${guildId}`;
      if (
        global.vanityCooldowns.get(cooldownKey) &&
        now - global.vanityCooldowns.get(cooldownKey) < 3000
      )
        return;
      Logger.warn(
        `Vanity changed: "${revertToVanity || "none"}" → "${
          newVanity || "none"
        }" in ${newGuild.name} (FAST)`,
      );
      const startTime = Date.now();
      const success = await revertVanityUrl(newGuild, revertToVanity);
      const elapsed = Date.now() - startTime;
      if (success) {
        Logger.success(
          `Vanity reverted to "${revertToVanity}" (FAST) [${elapsed}ms]`,
        );
        await sendFastModeNotification(
          newGuild,
          revertToVanity,
          newVanity,
          revertToVanity,
        );
        global.vanityCooldowns.set(cooldownKey, now);
        setTimeout(() => global.vanityCooldowns.delete(cooldownKey), 5000);
      }
      return;
    }

    Logger.warn(
      `Vanity changed: "${revertToVanity}" → "${newVanity}" in ${newGuild.name}`,
    );

    try {
      const auditLogs = await newGuild.fetchAuditLogs({ type: 1, limit: 1 });
      const updateEntry = auditLogs.entries.find(
        (e) => e.executor && Date.now() - e.createdTimestamp < 30000,
      );

      if (updateEntry && updateEntry.executor) {
        const executor = updateEntry.executor;
        Logger.warn(`Vanity changed by: ${executor.tag} (${executor.id})`);
        if (AntiNukeManager.shouldIgnore(executor.id)) return;

        const startTime = Date.now();
        const success = await revertVanityUrl(newGuild, revertToVanity);
        const elapsed = Date.now() - startTime;
        if (success)
          Logger.success(
            `Vanity reverted to "${revertToVanity}" [${elapsed}ms]`,
          );
        else Logger.error(`Failed to revert vanity in ${newGuild.name}`);

        const punishSuccess = await AntiNukeManager.punish(
          executor.id,
          guildId,
          `Unauthorized vanity URL change`,
        );
        if (punishSuccess)
          Logger.success(`Punished vanity attacker: ${executor.tag}`);
      }
    } catch (error) {
      Logger.error(`Failed to fetch audit logs for vanity: ${error.message}`);
    }
  },
};

async function getTicket(guildId) {
  try {
    const response = await fetch(
      `https://discord.com/api/v9/guilds/${guildId}/vanity-url`,
      {
        method: "PATCH",
        headers: {
          Authorization: global.config?.selfbot?.token || global.client?.token,
        },
        body: JSON.stringify({ code: "test" }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && data?.mfa?.ticket) return data.mfa.ticket;
  } catch (e) {
    Logger.debug(`getTicket: error=${e.message}`);
  }
  return null;
}

async function finishMfa(ticket) {
  try {
    const password = global.config?.vanity_reversion?.password;
    if (!password?.trim()) return null;
    const result = await global.client.api.mfa.finish.post({
      data: { ticket, mfa_type: "password", data: password },
    });
    return result?.token || null;
  } catch (e) {
    Logger.debug(`finishMfa: error=${e.message}`);
    return null;
  }
}

async function changeVanity(guildId, code, mfaToken) {
  try {
    await global.client.api
      .guilds(guildId, "vanity-url")
      .patch({ data: { code }, mfaToken });
    return { success: true };
  } catch (error) {
    const status = error.httpStatus || 0;
    return {
      success: false,
      authFailed: status === 401 || status === 403,
    };
  }
}

async function revertVanityUrl(guild, revertUrl) {
  const guildId = guild.id;
  let attempts = 0;

  while (attempts < 2) {
    try {
      let mfaToken = global.mfaTokenCache?.get(guildId);

      if (mfaToken && attempts === 0) {
        const result = await changeVanity(guildId, revertUrl, mfaToken);
        if (result.success) return true;
        if (result.authFailed) {
          global.mfaTokenCache?.invalidate(guildId);
          attempts++;
          continue;
        }
        global.mfaTokenCache?.invalidate(guildId);
        attempts++;
        continue;
      }

      if (global.mfaTokenCache?.isInProgress(guildId)) {
        await new Promise((r) => setTimeout(r, 300));
        mfaToken = global.mfaTokenCache?.get(guildId);
        if (mfaToken) {
          const result = await changeVanity(guildId, revertUrl, mfaToken);
          if (result.success) return true;
          if (result.authFailed) global.mfaTokenCache?.invalidate(guildId);
        }
      }

      global.mfaTokenCache?.setInProgress(guildId, true);
      const ticket = await getTicket(guildId);
      if (!ticket) {
        global.mfaTokenCache?.setInProgress(guildId, false);
        return false;
      }

      mfaToken = await finishMfa(ticket);
      if (!mfaToken) {
        global.mfaTokenCache?.setInProgress(guildId, false);
        return false;
      }

      global.mfaTokenCache?.set(guildId, mfaToken);
      global.mfaTokenCache?.setInProgress(guildId, false);

      const result = await changeVanity(guildId, revertUrl, mfaToken);
      if (result.success) return true;
      if (result.authFailed) global.mfaTokenCache?.invalidate(guildId);
      attempts++;
    } catch (error) {
      Logger.debug(`revertVanity: error=${error.message}`);
      global.mfaTokenCache?.setInProgress(guildId, false);
      global.mfaTokenCache?.invalidate(guildId);
      attempts++;
    }
  }
  return false;
}

async function sendFastModeNotification(
  guild,
  oldVanity,
  newVanity,
  revertedVanity,
) {
  try {
    const webhookUrl = global.config?.logs?.log_webhook;
    if (webhookUrl?.length > 8) {
      const { WebhookClient, MessageEmbed } =
        await import("discord.js-selfbot-v13");
      const embed = new MessageEmbed()
        .setTitle("Fast Vanity Reversion")
        .setDescription(
          `**Server:** ${guild.name}\n**Changed:** \`${
            oldVanity || "none"
          }\` → \`${newVanity || "none"}\`\n**Reverted to:** \`${
            revertedVanity || "none"
          }\``,
        )
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: "Vantrix Fast Mode" });
      const webhook = new WebhookClient({ url: webhookUrl });
      await webhook.send({ embeds: [embed], username: "Vantrix" });
      webhook.destroy();
    }

    if (global.config?.logs?.log_owner_dm) {
      const owners = [
        global.config.selfbot?.owner1_id,
        global.config.selfbot?.owner2_id,
      ].filter((id) => id?.trim());
      const msg = `Fast Vanity Protection\nServer: ${guild.name}\nVanity: ${oldVanity} → ${newVanity} → ${revertedVanity}`;
      for (const ownerId of owners) {
        try {
          const owner = await global.client.users.fetch(ownerId);
          await owner.send(msg);
        } catch (e) {}
      }
    }
  } catch (e) {}
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
