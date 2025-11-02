

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import Logger from '../../utils/Logger.js';
import axios from 'axios';

const superProps = {
  os: 'Windows',
  browser: 'Discord Client',
  release_channel: 'stable',
  client_version: '1.0.9213',
  os_version: '10.0.22000',
  os_arch: 'x64',
  app_arch: 'x64',
  system_locale: 'en-US',
  has_client_mods: false,
  browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9213 Chrome/134.0.6998.205 Electron/35.3.0 Safari/537.36',
  browser_version: '35.3.0',
  os_sdk_version: '22000',
  client_build_number: 463817,
  native_build_number: 71090,
  client_event_source: null,
  client_app_state: 'focused'
};

const encoded = Buffer.from(JSON.stringify(superProps)).toString('base64');

const DISCORD_HEADERS = {
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
  'x-super-properties': encoded
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
            Logger.warn(`🚫 Vanity URL changed: "${oldVanity}" → "${newVanity}" in ${guild.name}`, 'warning');
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
                    Logger.warn(`Vanity URL changed by: ${executor.tag} (${executor.id})`, 'warning');

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
                    Logger.debug(`Could not identify who changed vanity URL in ${guild.name}`, 'debug');
                }

            } catch (error) {
                Logger.error(`Failed to fetch audit logs for vanity change: ${error.message}`, 'error');
                Logger.debug(`Error details: ${error.stack}`, 'debug');
            }
        }
    }
};



async function getMFATicket(guildId) {

  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${guildId}/vanity-url`,
      { code: 'test' },
      { headers: DISCORD_HEADERS, validateStatus: () => true }
    );

    
    if (response.status === 401 && response.data?.mfa?.ticket) {
      const ticket = response.data.mfa.ticket;
      const sessionCookieString = response.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

      return {
        ticket: ticket,
        sessionCookies: sessionCookieString
      };
    } else {
      throw new Error('MFA ticket not found in response. Expected 401 with ticket.');
    }

  } catch (error) {
    Logger.error('Step 1 failed (get MFA ticket):', error.message);
    throw error;
  }
}


async function finishMFA(ticket, password) {
  const body = {
    mfa_type: 'password',
    ticket: ticket,
    data: password,
  };

  try {
    const response = await axios.post(
      'https://discord.com/api/v9/mfa/finish',
      body,
      { headers: DISCORD_HEADERS }
    );

    const setCookies = response.headers['set-cookie'] || [];
    const mfaCookieFull = setCookies.find(cookie => cookie.startsWith('__Secure-recent_mfa='));

    if (mfaCookieFull) {
      const mfaToken = mfaCookieFull.split(';')[0].replace('__Secure-recent_mfa=', '');
      const mfaCookie = mfaCookieFull.split(';')[0];

      return {
        token: mfaToken,
        cookie: mfaCookie
      };
    } else {
      throw new Error('__Secure-recent_mfa cookie not found in MFA finish response');
    }

  } catch (error) {
    Logger.error('Step 2 failed (finish MFA):', error.message);
    throw error;
  }
}


async function changeVanityURL(guildId, newCode, mfaToken, mfaCookie, sessionCookies) {
  
  const sessionCookieArray = sessionCookies.split('; ')
    .filter(cookie => cookie.trim() && !cookie.startsWith('__Secure-recent_mfa='));

  
  let completeCookieString = mfaCookie;
  if (sessionCookieArray.length > 0) {
    completeCookieString = sessionCookieArray.join('; ') + '; ' + mfaCookie;
  }

  const headersWithMFA = {
    ...DISCORD_HEADERS,
    'x-discord-mfa-authorization': mfaToken,
    'Cookie': completeCookieString
  };

  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${guildId}/vanity-url`,
      { code: newCode },
      { headers: headersWithMFA }
    );

    if (response.status === 200) {
      return true;
    } else {
      throw new Error(`Vanity change failed with status ${response.status}`);
    }

  } catch (error) {
    Logger.error('Step 3 failed (change vanity):', error.message);
    throw error;
  }
}


async function revertVanityUrl(guild, revertUrl, executor) {
  try {
    Logger.debug(`Attempting to revert vanity URL to "${revertUrl}" in ${guild.name}`);

    
    const password = global.config?.vanity_reversion?.password;
    if (!password || password.trim() === '') {
      Logger.warn(`Vanity reversion password not configured in config.yml`);
      Logger.warn(`Add your Discord password to config.yml under vanity_reversion.password`);
      Logger.warn(`Cannot revert vanity URL - punishment only`);
      return false;
    }

    
    const { ticket, sessionCookies } = await getMFATicket(guild.id);

    
    const { token: mfaToken, cookie: mfaCookie } = await finishMFA(ticket, password);

    
    const success = await changeVanityURL(guild.id, revertUrl, mfaToken, mfaCookie, sessionCookies);

    if (success) {
      Logger.success(`✅ Successfully reverted vanity URL to "${revertUrl}"`);
      return true;
    } else {
      Logger.error(`❌ Failed to revert vanity URL change in ${guild.name}`);
      return false;
    }

  } catch (error) {
    Logger.error(`Failed to revert vanity URL for ${guild.name}: ${error.message}`);

    
    if (error.response) {
      const status = error.response.status;
      const errorMessage = error.response.data?.message || 'Unknown error';

      if (status === 403) {
        Logger.error(`Insufficient permissions to revert vanity URL (403): ${errorMessage}`);
        Logger.error(`Make sure the bot account owns this server or has proper permissions`);
        Logger.error(`Discord may be forbidding the request due to automated detection`);
      } else if (status === 400) {
        Logger.error(`Invalid vanity code, ineligible server, or Discord forbidding due to detection (400): ${errorMessage}`);
        Logger.error(`Check if the vanity URL "${revertUrl}" is valid and the server supports vanity URLs`);
        Logger.error(`Discord may be forbidding the request due to automated detection`);
      } else if (status === 401) {
        Logger.error(`Authentication failed (401): ${errorMessage}`);
        Logger.error(`Check if the password in config.yml is correct`);
      } else if (status === 429) {
        Logger.error(`Rate limited while reverting vanity URL (429): ${errorMessage}`);
        Logger.error(`Wait a few minutes before trying again`);
      } else {
        Logger.error(`API error ${status} while reverting vanity URL: ${errorMessage}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      Logger.error('Request timed out while reverting vanity URL');
    } else {
      Logger.error(`Network error while reverting vanity URL: ${error.code || error.message}`);
    }

    Logger.warn(`Vanity URL reversion failed, but attacker was punished`);
    return false;
  }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */