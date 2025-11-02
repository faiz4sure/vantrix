import { Client } from 'discord.js-selfbot-v13';
import yaml from 'js-yaml';
import fs from 'fs';
import boxen from 'boxen';
import figlet from 'figlet';

import Logger from './utils/Logger.js';
import Anticrash from './handlers/Anticrash.js';
import EventsHandler from './handlers/EventsHandler.js';

let config;
let client;

try {
    config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));
    Logger.success('Configuration loaded from config.yml');
} catch (error) {
    Logger.error(`Failed to load configuration: ${error.message}`);
    Logger.error('Please ensure config.yml exists and is properly formatted');
    process.exit(1);
}

if (!config.selfbot?.token || config.selfbot.token === '') {
    Logger.error('No Discord token provided in config.yml');
    Logger.error('Please set the token in the selfbot.token field');
    process.exit(1);
}

const protectedServers = [];
if (config.selfbot?.server1_id && config.selfbot.server1_id !== '') {
    protectedServers.push(config.selfbot.server1_id);
}
if (config.selfbot?.server2_id && config.selfbot.server2_id !== '') {
    protectedServers.push(config.selfbot.server2_id);
}

if (protectedServers.length === 0) {
    Logger.error('No protected servers configured in config.yml');
    Logger.error('Please set server1_id (and optionally server2_id) in selfbot section');
    process.exit(1);
}

config.protectedServers = protectedServers;

Logger.info(`Configured to protect ${protectedServers.length} server(s): ${protectedServers.join(', ')}`);

const owners = [];
if (config.selfbot?.owner1_id && config.selfbot.owner1_id !== '') {
    owners.push(config.selfbot.owner1_id);
}
if (config.selfbot?.owner2_id && config.selfbot.owner2_id !== '') {
    owners.push(config.selfbot.owner2_id);
}

if (owners.length === 0) {
    Logger.error('No owner IDs configured in config.yml');
    Logger.error('Please set owner1_id (and optionally owner2_id) in selfbot section');
    process.exit(1);
}

Logger.info(`Configured ${owners.length} owner(s) for notifications`);

Anticrash.init();

client = new Client({
    checkUpdate: false,
    autoRedeemNitro: false,
    patchVoice: false,
    syncStatus: false,
    presence: {
        status: 'dnd',
        afk: false,
        activities: []
    },
    RPC: false
});

global.config = config;
global.client = client;

Logger.system('Discord client created');
Logger.success('Global variables (config and client) set');

async function main() {
    try {
        console.clear();

        const banner = figlet.textSync('ANTI-NUKE', {
            font: 'Standard',
            horizontalLayout: 'default',
            verticalLayout: 'default'
        });

        const boxContent = `${banner}\n\n💻 Rewritten by faiz4sure`;

        const styledBanner = boxen(boxContent, {
            title: '🚀 Discord Antinuke System',
            titleAlignment: 'center',
            borderStyle: 'bold',
            borderColor: 'cyan',
            backgroundColor: '#001122',
            padding: 0,
            margin: 0,
            width: 70,
            textAlignment: 'center',
            float: 'center'
        });

        console.log(styledBanner);
        console.log('');

        await EventsHandler.loadEvents(client);

        client.on('error', (error) => {
            Logger.error(`Discord client error: ${error.message}`);
        });

        client.on('disconnect', () => {
            Logger.warn('Discord client disconnected');
        });

        client.on('reconnecting', () => {
            Logger.info('Discord client reconnecting...');
        });

        client.on('warn', (warning) => {
            Logger.warn(`Discord client warning: ${warning}`);
        });

        Logger.system('Attempting to login to Discord...');
        await client.login(config.selfbot.token);

    } catch (error) {
        Logger.error(`Application startup failed: ${error.message}`);
        if (error.stack) {
            Logger.debug(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

main().catch((error) => {
    Logger.error(`Unhandled error in main: ${error.message}`);
    process.exit(1);
});

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */