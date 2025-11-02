

export default {
    name: 'guildCreate',
    once: false, 
    execute(client, guild) {
        console.log(`📥 Joined new guild: ${guild.name} (${guild.id})`);
        console.log(`   👥 Members: ${guild.memberCount || 'Unknown'}`);
    }
};

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */