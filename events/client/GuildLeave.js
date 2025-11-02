

import AntiNukeManager from '../../utils/AntiNukeManager.js';
import Logger from '../../utils/Logger.js';
import { WebhookClient, MessageEmbed } from 'discord.js-selfbot-v13';
import RateLimitManager from '../../utils/RateLimitManager.js';
import WhitelistManager from '../../utils/WhitelistManager.js';

export default {
    name: 'guildDelete',
    once: false,
    async execute(client, guild) {
        Logger.warn(`🚫 Bot removed from guild: ${guild.name} (${guild.id}) - Member count: ${guild.memberCount}`, 'warning');

        
        const wasProtected = AntiNukeManager.isProtectedServer(guild.id);

        if (wasProtected) {
            Logger.error(`🛡️ CRITICAL: Bot removed from protected server: ${guild.name} (${guild.id})`, 'error');
            Logger.error(`This may indicate an anti-nuke bypass attempt or unauthorized removal!`, 'error');

            
            await sendProtectedGuildRemovalWebhook(guild);

            
            await notifyOwnersAboutGuildRemoval(guild, client);

        } else {
            Logger.info(`ℹ️ Bot left unmonitored guild: ${guild.name}`, 'info');
        }

        
        Logger.info(`Guild cache cleaned - Current guild count: ${client.guilds.cache.size}`, 'info');
    }
};


async function sendProtectedGuildRemovalWebhook(guild) {
    const webhookUrl = global.config?.logs?.emergency_webhook;

    if (!webhookUrl || webhookUrl.length < 8) {
        Logger.warn('No emergency webhook configured - cannot send critical alerts');
        return;
    }

    try {
        const embed = new MessageEmbed()
            .setTitle(`🚨 CRITICAL: Protected Guild Removal`)
            .setDescription(`**Emergency Alert:** Bot was removed from a protected server\n\n` +
                           `**Server:** ${guild.name}\n` +
                           `**Server ID:** ${guild.id}\n` +
                           `**Member Count:** ${guild.memberCount}\n` +
                           `**Owner:** ${guild.ownerId}\n\n` +
                           `⚠️ **This may indicate:**\n` +
                           `• Anti-nuke bypass attempt\n` +
                           `• Unauthorized bot removal\n` +
                           `• Server takeover incident\n\n` +
                           `**Immediate investigation recommended!**`)
            .setColor(0xFF0000)
            .setTimestamp()
            .setFooter({ text: 'Anti-Nuke Emergency Alert' });

        await RateLimitManager.execute(
            'webhook.emergency',
            async () => {
                const webhook = new WebhookClient({ url: webhookUrl });
                await webhook.send({
                    content: '**PROTECTED GUILD REMOVAL DETECTED!**',
                    embeds: [embed]
                });
                webhook.destroy();
            },
            [],
            { retryLimit: 3, initialBackoff: 1000 }
        );

        Logger.success(`Sent emergency webhook alert for guild removal`);

    } catch (error) {
        Logger.error(`Failed to send emergency webhook: ${error.message}`);
    }
}


async function notifyOwnersAboutGuildRemoval(guild, client) {
    if (!global.config?.logs?.log_owner_dm) {
        Logger.debug('Owner DM notifications disabled');
        return;
    }

    const owners = WhitelistManager.getAllOwners();
    if (owners.length === 0) {
        Logger.warn('No owners configured - cannot send removal notifications');
        return;
    }

    const incidentMessage = `🚨 **CRITICAL EMERGENCY ALERT**\n\n` +
                           `**Bot Removed from Protected Server!**\n\n` +
                           `**Server Details:**\n` +
                           `• Name: ${guild.name}\n` +
                           `• ID: ${guild.id}\n` +
                           `• Members: ${guild.memberCount}\n` +
                           `• Owner: ${guild.ownerId}\n\n` +
                           `**This may indicate:**\n` +
                           `• Server takeover attempt\n` +
                           `• Anti-nuke bypass\n` +
                           `• Unauthorized removal\n\n` +
                           `**Immediate investigation required!**\n` +
                           `Check anti-nuke logs and investigate server status.\n\n` +
                           `**Time:** ${new Date().toISOString()}`;

    Logger.info(`Attempting to notify ${owners.length} owner(s) about critical guild removal`);

    let notifiedCount = 0;
    let failedCount = 0;

    for (const ownerId of owners) {
        try {
            
            const owner = await RateLimitManager.execute(
                `users.fetch.${ownerId}`,
                async () => await client.users.fetch(ownerId),
                [],
                { retryLimit: 1 }
            ).catch(() => null);

            if (!owner) {
                Logger.debug(`Could not fetch owner ${ownerId} for emergency notification`);
                failedCount++;
                continue;
            }

            
            await RateLimitManager.execute(
                `users.${ownerId}.send.emergency`,
                async () => {
                    try {
                        await owner.send(incidentMessage);
                        notifiedCount++;
                        Logger.debug(`✅ Emergency notification sent to owner ${owner.username}`);

                    } catch (dmError) {
                        
                        if (dmError.code === 50007) {
                            
                            Logger.debug(`ℹ️ Owner ${owner.username} has DMs disabled`);

                        } else if (dmError.code === 50013) {
                            
                            Logger.debug(`⚠️ Missing DM permissions for owner ${owner.username}`);

                        } else if (dmError.code === 10013) {
                            
                            Logger.debug(`⚠️ Owner ${ownerId} appears to be an unknown user`);

                        } else {
                            
                            Logger.debug(`⚠️ Failed to DM owner ${owner.username}: ${dmError.message}`);
                        }
                    }
                },
                [],
                { retryLimit: 1, initialBackoff: 500 } 
            );

        } catch (error) {
            failedCount++;
            Logger.debug(`❌ Error notifying owner ${ownerId}: ${error.message}`);
        }
    }

    if (failedCount > 0) {
        Logger.warn(`Emergency notifications: ${notifiedCount} sent, ${failedCount} failed`);
    } else if (notifiedCount > 0) {
        Logger.success(`✅ All ${notifiedCount} owner(s) notified of critical incident`);
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */