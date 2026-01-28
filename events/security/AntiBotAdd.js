import AntiNukeManager from "../../utils/AntiNukeManager.js";
import Logger from "../../utils/Logger.js";

export default {
  name: "guildMemberAdd",
  once: false,
  execute(client, member) {
    if (!member.user?.bot) return;
    if (!AntiNukeManager.isProtectedServer(member.guild.id)) return;

    Logger.warn(
      `Bot added: ${member.user.tag} (${member.user.id}) in ${member.guild.name}`
    );

    member.guild
      .fetchAuditLogs({ type: 28, limit: 1 })
      .then(async (auditLogs) => {
        const botAddEntry = auditLogs.entries.find(
          (e) =>
            e.target?.id === member.user.id &&
            Date.now() - e.createdTimestamp < 30000
        );

        if (botAddEntry && botAddEntry.executor) {
          const inviter = botAddEntry.executor;
          Logger.warn(`Bot invited by: ${inviter.tag} (${inviter.id})`);

          if (AntiNukeManager.shouldIgnore(inviter.id)) {
            Logger.info(
              `Bot addition by whitelisted user ${inviter.tag} - allowing`
            );
            return;
          }

          Logger.warn(`BOT DETECTED - Punishing both bot and inviter`);

          const botPunished = await AntiNukeManager.punish(
            member.user.id,
            member.guild.id,
            `Unauthorized bot - ${member.user.tag} (invited by ${inviter.tag})`
          );

          const inviterPunished = await AntiNukeManager.punish(
            inviter.id,
            member.guild.id,
            `Unauthorized bot invitation - ${member.user.tag}`
          );

          Logger.success(
            `Bot removal: Bot ${botPunished ? "punished" : "spared"}, Inviter ${
              inviterPunished ? "punished" : "spared"
            }`
          );
        } else {
          Logger.warn(`Could not identify bot inviter - punishing bot only`);
          AntiNukeManager.punish(
            member.user.id,
            member.guild.id,
            `Unauthorized bot (inviter unknown) - ${member.user.tag}`
          );
        }
      })
      .catch((error) => {
        Logger.error(`Failed to fetch audit logs: ${error.message}`);
        AntiNukeManager.punish(
          member.user.id,
          member.guild.id,
          `Unauthorized bot (audit error) - ${member.user.tag}`
        );
      });
  },
};

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
