import AntiNukeManager from "../../utils/AntiNukeManager.js";
import Logger from "../../utils/Logger.js";

export default {
  name: "guildAuditLogEntryCreate",
  once: false,
  async execute(client, entry, guild) {
    if (!guild) return;
    if (!AntiNukeManager.isProtectedServer(guild.id)) return;
    if (entry.action !== "GUILD_UPDATE" || entry.targetType !== "GUILD") return;
    if (Date.now() - entry.createdTimestamp > 30000) return;

    const executor = entry.executor;
    if (!executor) return;

    const vanityChange = entry.changes?.find(
      (c) =>
        c.key === "vanity_url_code" ||
        c.key === "vanity_url" ||
        c.key === "vanityURLCode",
    );
    if (!vanityChange) return;

    const oldVanity = vanityChange.old;
    const newVanity = vanityChange.new;
    let revertToVanity = oldVanity;

    if (
      (oldVanity === null || oldVanity === undefined) &&
      global.config?.vanity_reversion?.fallback_vanity
    ) {
      const fallback = global.config.vanity_reversion.fallback_vanity.trim();
      if (fallback) revertToVanity = fallback;
    }

    if (!revertToVanity && !newVanity) return;
    if (revertToVanity === newVanity) return;

    const vanityMode = global.config?.vanity_mode || "normal";
    if (vanityMode !== "audit") return;

    Logger.warn(
      `Vanity changed: "${revertToVanity || "none"}" → "${
        newVanity || "none"
      }" in ${guild.name} (AUDIT)`,
    );
    Logger.warn(`Vanity changed by: ${executor.tag} (${executor.id})`);

    if (AntiNukeManager.shouldIgnore(executor.id)) return;

    const startTime = Date.now();
    const success = await revertVanityUrl(guild, revertToVanity);
    const elapsed = Date.now() - startTime;
    if (success)
      Logger.success(
        `Vanity reverted to "${revertToVanity}" (AUDIT) [${elapsed}ms]`,
      );
    else Logger.error(`Failed to revert vanity in ${guild.name} (AUDIT)`);

    const punishSuccess = await AntiNukeManager.punish(
      executor.id,
      guild.id,
      `Unauthorized vanity URL change`,
    );
    if (punishSuccess)
      Logger.success(`Punished vanity attacker: ${executor.tag}`);
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

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
