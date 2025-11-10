

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import Logger from '../../utils/Logger.js';
import axios from 'axios';

const headers = {
  Authorization: global.config?.selfbot?.token || global.client?.token,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9213 Chrome/134.0.6998.205 Electron/35.3.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'DNT': '1',
  'Origin': 'https://discord.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-GPC': '1',
  'sec-ch-ua': '"Not:A-Brand";v="24", "Chromium";v="134"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'x-debug-options': 'bugReporterEnabled',
  'x-discord-locale': 'en-US',
  'x-super-properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRGlzY29yZCBDbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjbGllbnRfdmVyc2lvbiI6IjEuMC45MjEzIiwib3NfdmVyc2lvbiI6IjEwLjAuMjIwMDAiLCJvc19hcmNoIjoieDY0IiwiYXBwX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoiZW4tVVMiLCJoYXNfY2xpZW50X21vZHMiOmZhbHNlLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBkaXNjb3JkLzEuMC45MjEzIENocm9tZS8xMzQuMC42OTk4LjIwNSBFbGVjdHJvbi8zNS4zLjAgU2FmYXJpLzUzNy4zNiIsImJyb3dzZXJfdmVyc2lvbiI6IjM1LjMuMCIsIm9zX3Nka192ZXJzaW9uIjoiMjIwMDAiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjo0NjM4MTcsIm5hdGl2ZV9idWlsZF9udW1iZXIiOjcxMDkwLCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsLCJjbGllbnRfYXBwX3N0YXRlIjoiZm9jdXNlZCJ9'
};

export default {
    name: 'guildUpdate',
    once: false,
    async execute(oldGuild, newGuild) {
        const guild = newGuild;

        if (!AntiNukeManager.isProtectedServer(guild.id)) {
            return;
        }

        const oldVanity = oldGuild.vanityURLCode;
        const newVanity = newGuild.vanityURLCode;

        let revertToVanity = oldVanity;
        if ((oldVanity === null || oldVanity === undefined) && global.config?.vanity_reversion?.fallback_vanity) {
            const fallbackVanity = global.config.vanity_reversion.fallback_vanity.trim();
            if (fallbackVanity) {
                revertToVanity = fallbackVanity;
                Logger.debug(`Using fallback vanity URL: "${fallbackVanity}" (old vanity was ${oldVanity})`);
            }
        }

        if (oldVanity !== newVanity) {
            Logger.warn(`🚫 Vanity URL changed: "${oldVanity}" → "${newVanity}" in ${guild.name}`);
            Logger.info(`Will revert to: "${revertToVanity}"`);

            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 1,
                    limit: 1
                });

                const updateEntry = auditLogs.entries.find(entry =>
                    entry.executor &&
                    (Date.now() - entry.createdTimestamp) < 30000
                );

                if (updateEntry && updateEntry.executor) {
                    const executor = updateEntry.executor;
                    Logger.warn(`Vanity URL changed by: ${executor.tag} (${executor.id})`);

                    if (AntiNukeManager.shouldIgnore(executor.id)) {
                        Logger.debug(`Ignoring vanity change by ${executor.tag} (${AntiNukeManager.isBot(executor.id) ? 'BOT' : 'WHITELISTED'})`);
                        return;
                    }

                    Logger.warn(`Punishing vanity attacker: ${executor.tag} (${executor.id})`);
                    const punishmentSuccess = await AntiNukeManager.punish(
                        executor.id,
                        guild.id,
                        `Attempted unauthorized vanity URL change`
                    );

                    if (punishmentSuccess) {
                        Logger.success(`Punished vanity URL attacker: ${executor.tag}`);
                    } else {
                        Logger.warn(`Could not punish vanity attacker: ${executor.tag} (insufficient permissions?)`);
                    }

                    const revertSuccess = await revertVanityUrl(guild, revertToVanity, executor);

                    if (revertSuccess) {
                        Logger.success(`✅ Vanity URL reverted to "${revertToVanity}" for ${guild.name}`);
                    } else {
                        Logger.error(`❌ Failed to revert vanity URL change in ${guild.name} (but attacker punished)`);
                    }

                } else {
                    Logger.debug(`Could not identify who changed vanity URL in ${guild.name}`);
                }

            } catch (error) {
                Logger.error(`Failed to fetch audit logs for vanity change: ${error.message}`);
                Logger.debug(`Error details: ${error.stack}`);
            }
        }
    }
};



async function getTicket(guildId) {
  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${guildId}/vanity-url`,
      { code: 'test' },
      { headers: headers, validateStatus: () => true }
    );

    Logger.debug(`Get ticket response: ${JSON.stringify(response.data)}`);

    if (response.status === 401 && response.data?.mfa?.ticket) {
      return response.data.mfa.ticket;
    }
  } catch (error) {
    Logger.error(`ticket error: ${error.message}`);
  }
  return null;
}

async function finishMFA(ticket) {
  try {
    const password = global.config?.vanity_reversion?.password;
    if (!password || password.trim() === '') {
      Logger.warn('Vanity reversion password not configured');
      return null;
    }

    Logger.debug(`Using password for MFA: ${password}`);

    const response = await axios.post(
      'https://discord.com/api/v9/mfa/finish',
      {
        ticket: ticket,
        mfa_type: 'password',
        data: password,
      },
      { headers: headers }
    );

    Logger.debug(`Finish MFA response: ${JSON.stringify(response.data)}`);

    if (response.data?.token) {
      return response.data.token;
    }
  } catch (error) {
    Logger.error(`mfa error: ${error.message}`);
  }
  return null;
}

async function changeVanity(guildId, code, mfaToken) {
  try {
    const mfaHeaders = {
      ...headers,
      'x-discord-mfa-authorization': mfaToken
    };

    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${guildId}/vanity-url`,
      { code: code },
      { headers: mfaHeaders, validateStatus: () => true }
    );

    Logger.debug(`Change vanity response: ${JSON.stringify(response.data)}`);

    if (response.status === 200) {
      return true;
    } else {
      let errorMessage = `Vanity change failed with status ${response.status}`;

      if (response.status === 403) {
        errorMessage += ' - This may occur if the vanity URL is not valid, or Discord is forbidding this account/IP address due to frequent requests on changing vanity URLs';
      } else if (response.status === 400) {
        errorMessage += ' - Discord may block multiple requests and just show 400 sometimes. Try again later';
      } else if (response.status === 401) {
        errorMessage += ' - Authentication failed. Check if MFA token is valid';
      } else if (response.status === 429) {
        errorMessage += ' - Rate limited. Wait a few minutes before trying again';
      }

      Logger.error(errorMessage);
      return false;
    }
  } catch (error) {
    Logger.error(`vanity error: ${error.message}`);
    if (error.response) {
      Logger.debug(`Change vanity error response: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function revertVanityUrl(guild, revertUrl, executor) {
  try {
    Logger.debug(`Attempting to revert vanity URL to "${revertUrl}" in ${guild.name}`);

    const ticket = await getTicket(guild.id);
    if (!ticket) return false;

    const mfaToken = await finishMFA(ticket);
    if (!mfaToken) return false;

    const success = await changeVanity(guild.id, revertUrl, mfaToken);

    if (success) {
      Logger.success(`Successfully reverted vanity URL to "${revertUrl}"`);
      return true;
    }
  } catch (error) {
    Logger.error(`Failed to revert vanity URL for ${guild.name}: ${error.message}`);
  }
  return false;
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
