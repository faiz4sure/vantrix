

import Logger from '../../utils/Logger.js';
import kleur from 'kleur';
import boxen from 'boxen';
import figlet from 'figlet';

export default {
    name: 'ready',
    once: true, 
    async execute(client) {
        
        try {
            if (process.platform === 'win32') {
                
                process.stdout.write('\x1Bc');
            } else {
                
                try {
                    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
                } catch (e) {
                    try {
                        process.stdout.write('\x1Bc');
                    } catch (e2) {
                        console.clear();
                    }
                }
            }
        } catch (error) {
            
            console.clear();
        }

        
        const connectedArt = figlet.textSync('VANTRIX', {
            font: 'Small',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        });

        
        const infoContent = `${connectedArt}\n\n⭐ Successfully connected to Discord!\n👨‍💻 Author: faiz4sure\n📦 GitHub: https://github.com/faiz4sure/vantrix\n🤝 Support: https://discord.gg/NUPbGzY8Be`;

        const readyBanner = boxen(infoContent, {
            title: 'Discord Antinuke Selfbot',
            titleAlignment: 'center',
            borderStyle: 'round',
            borderColor: 'green',
            backgroundColor: '#002211',
            padding: 1,
            margin: 0,
            width: 65,
            textAlignment: 'center',
            float: 'center'
        });

        console.log(readyBanner);
        console.log('');

        
        console.log(kleur.green().bold('📱 Logged in as: ') + kleur.white(client.user.tag));
        console.log(kleur.yellow().bold('🆔 Client ID: ') + kleur.white(client.user.id));
        console.log(kleur.blue().bold('🏠 Connected to: ') + kleur.white(`${client.guilds.cache.size} server(s)`));
        console.log('');

        
        const owners = [];
        if (global.config.selfbot?.owner1_id && global.config.selfbot.owner1_id !== '') {
            owners.push(global.config.selfbot.owner1_id);
        }
        if (global.config.selfbot?.owner2_id && global.config.selfbot.owner2_id !== '') {
            owners.push(global.config.selfbot.owner2_id);
        }

        
        const botId = client.user.id;
        const matchingOwners = owners.filter(ownerId => ownerId === botId);

        if (matchingOwners.length > 0) {
            Logger.error(`Owner ID(s) ${matchingOwners.join(', ')} match the bot's own user ID`);
            Logger.error('Bot cannot be configured as its own owner');
            Logger.error('Please update owner IDs in config.yml');
            process.exit(1);
        }

        Logger.success('Owner ID validation passed');

        
        await validateProtectedServers(client);

        
        if (global.config.rpc?.enabled) {
            await setupRPC(client);
        } else {
            Logger.debug('RPC disabled in configuration');
        }
    }
};


async function setupRPC(client) {
    try {
        Logger.debug('Setting up Rich Presence...');

        const rpc = client.presence;

        const rpcStatuses = [
            {
                name: 'ragebaiting immature nukers',
                type: 'PLAYING',
                details: 'these clowns getting rekt effortlessly 💀'
            },
            {
                name: 'skibidi servers',
                type: 'WATCHING',
                details: 'these nukers don\'t stand a chance 💔'
            },
            {
                name: 'roasting prepub nukers',
                type: 'PLAYING',
                details: 'standing nonchalant in raid storms 💀'
            },
            {
                name: 'typing Rizzler.exe',
                type: 'WATCHING',
                details: 'brainrot security protocols 🧠💀'
            },
            {
                name: 'fanum taxing raid kids',
                type: 'PLAYING',
                details: 'stealing raids before they even touch servers 💔'
            },
            {
                name: 'Ohio Raid Prevention',
                type: 'PLAYING',
                details: 'they never stood a chance 🥀'
            },
            {
                name: 'roasting delulus',
                type: 'PLAYING',
                details: 'safekeeping ur clown delusions 💔'
            },
            {
                name: 'girl dinner cleanup',
                type: 'PLAYING',
                details: 'mass unban chefs getting cleaned 🥀'
            },
            {
                name: 'ratioing edgelords',
                type: 'WATCHING',
                details: 'monitoring jawlines and exploits 💀'
            },
            {
                name: 'sigma male grindset',
                type: 'PLAYING',
                details: 'lone wolf guarding the pack 💔🥀'
            },
            {
                name: 'skibidi toilet defense',
                type: 'PLAYING',
                details: 'waiting for the flush 💔🥀'
            },
            {
                name: 'rizz protocol',
                type: 'PLAYING',
                details: 'serving looks and server looks 💀'
            },
            {
                name: 'nonchalant wiping kids',
                type: 'WATCHING',
                details: 'cool kids ban raiders like they don\'t care 🥀'
            },
            {
                name: 'aesthetic wangjis',
                type: 'WATCHING',
                details: 'guarding ur painfully online feeds 💔'
            },
            {
                name: 'grindset security',
                type: 'PLAYING',
                details: 'no cap, they thought they could touch servers 🥀'
            },
            {
                name: 'clown fiesta cleanup',
                type: 'PLAYING',
                details: 'banning virgins who think they\'re sigma 💀'
            },
            {
                name: 'beta male obliteration',
                type: 'WATCHING',
                details: 'pretend nukers getting ratio\'d in seconds 💔'
            },
            {
                name: 'gyatt watching',
                type: 'PLAYING',
                details: 'guarding servers while ignoring distractions 🥀'
            }
        ];

        let currentStatusIndex = 0;

        
        await setRPCStatus(client, rpcStatuses[currentStatusIndex]);
        Logger.success('Initial Rich Presence status set');

        
        if (global.config.rpc?.rotation) {
            const rotationInterval = setInterval(async () => {
                currentStatusIndex = (currentStatusIndex + 1) % rpcStatuses.length;

                try {
                    await setRPCStatus(client, rpcStatuses[currentStatusIndex]);
                    Logger.debug(`RPC status rotated to: ${rpcStatuses[currentStatusIndex].details}`);
                } catch (error) {
                    Logger.debug(`RPC rotation failed: ${error.message}`);
                }
            }, 15 * 60 * 1000); 

            Logger.success('RPC rotation enabled (15 minute intervals)');

            
            process.on('SIGINT', () => {
                clearInterval(rotationInterval);
            });
        } else {
            Logger.debug('RPC rotation disabled');
        }

    } catch (error) {
        Logger.debug(`RPC setup failed: ${error.message}`);
        
    }
}


async function setRPCStatus(client, statusConfig) {
    const activities = [{
        name: statusConfig.name,
        type: statusConfig.type,
        details: statusConfig.details,
        timestamps: {
            start: Date.now()
        }
    }];

    await client.user.setPresence({
        activities: activities,
        status: 'dnd'
    });
}


async function validateProtectedServers(client) {
    if (!global.config?.protectedServers || global.config.protectedServers.length === 0) {
        Logger.debug('No protected servers configured for validation');
        return;
    }

    const protectedServers = global.config.protectedServers;
    let validationPassed = true;

    for (const serverId of protectedServers) {
        try {
            
            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                console.log(kleur.red().bold('⚠️  WARNING: ') +
                           kleur.white(`Bot is not a member of protected server: ${serverId}`));
                console.log(kleur.yellow('   Please invite the bot to this server!'));
                validationPassed = false;
                continue;
            }

            
            const botMember = guild.members.cache.get(client.user.id);
            if (!botMember) {
                console.log(kleur.red().bold('⚠️  WARNING: ') +
                           kleur.white(`Bot member not found in protected server: ${guild.name} (${guild.id})`));
                validationPassed = false;
                continue;
            }

            
            const hasAdmin = botMember.permissions.has('ADMINISTRATOR');
            if (!hasAdmin) {
                console.log(kleur.red().bold('⚠️  WARNING: ') +
                           kleur.white(`Bot lacks ADMINISTRATOR permission in: ${guild.name} (${guild.id})`));
                console.log(kleur.yellow('   The bot needs Administrator permissions to protect this server!'));
                validationPassed = false;
                continue;
            }

            
            console.log(kleur.green().bold('✅ Server validation passed: ') +
                       kleur.white(`${guild.name} (${guild.id})`));

        } catch (error) {
            console.log(kleur.red().bold('⚠️  WARNING: ') +
                       kleur.white(`Error validating server ${serverId}: ${error.message}`));
            validationPassed = false;
        }
    }

    if (validationPassed) {
        console.log(kleur.green().bold('\n🚀 All protected servers validated successfully!\n'));
    } else {
        console.log(kleur.yellow().bold('\n⚠️  Some issues found with protected servers.'));
        console.log(kleur.white('   The bot may not function properly in servers with issues.\n'));
    }
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */