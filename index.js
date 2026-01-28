import { Client } from "discord.js-selfbot-v13";
import yaml from "js-yaml";
import fs from "fs";
import boxen from "boxen";
import figlet from "figlet";

import Logger from "./utils/Logger.js";
import Anticrash from "./handlers/Anticrash.js";
import EventsHandler from "./handlers/EventsHandler.js";
import mfaTokenCache from "./utils/MfaTokenCache.js";
import { runCleanup } from "./utils/db.js";

let config;
let client;

try {
  config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
  Logger.success("Configuration loaded from config.yml");
} catch (error) {
  Logger.error(`Failed to load configuration: ${error.message}`);
  Logger.error("Please ensure config.yml exists and is properly formatted");
  process.exit(1);
}

if (!config.selfbot?.token || config.selfbot.token === "") {
  Logger.error("No Discord token provided in config.yml");
  process.exit(1);
}

if (!config.selfbot?.server_id || config.selfbot.server_id === "") {
  Logger.error("No server_id configured in config.yml");
  process.exit(1);
}

config.protectedServer = config.selfbot.server_id;
Logger.info(`Configured to protect server: ${config.protectedServer}`);

const owners = [];
if (config.selfbot?.owner1_id && config.selfbot.owner1_id !== "") {
  owners.push(config.selfbot.owner1_id);
}
if (config.selfbot?.owner2_id && config.selfbot.owner2_id !== "") {
  owners.push(config.selfbot.owner2_id);
}

if (owners.length === 0) {
  Logger.error("No owner IDs configured in config.yml");
  process.exit(1);
}

config.owners = owners;
Logger.info(`Configured ${owners.length} owner(s) for notifications`);

Anticrash.init();

const statusType = config.status?.type || "dnd";
const validStatuses = ["online", "idle", "dnd", "invisible"];
const finalStatus = validStatuses.includes(statusType) ? statusType : "dnd";

const browserType = config.status?.browser || "Discord Client";
const validBrowsers = [
  "Discord Client",
  "Chrome",
  "Firefox",
  "Discord iOS",
  "Discord Android",
];
const finalBrowser = validBrowsers.includes(browserType)
  ? browserType
  : "Discord Client";

client = new Client({
  checkUpdate: false,
  autoRedeemNitro: false,
  patchVoice: false,
  syncStatus: false,
  presence: {
    status: finalStatus,
    afk: false,
    activities: [],
  },
  RPC: false,
  restTimeOffset: 0,
  restRequestTimeout: 5000,
  retryLimit: 0,
  restGlobalRateLimit: 50,
  ws: {
    properties: {
      browser: finalBrowser,
    },
  },
});

global.config = config;
global.client = client;
global.mfaTokenCache = mfaTokenCache;
mfaTokenCache.init();

const timeWindow = config.antinuke_settings?.time_window || 36000000;
setInterval(() => runCleanup(timeWindow), 300000);

Logger.system("Discord client created");
Logger.success(`Status: ${finalStatus} | Browser: ${finalBrowser}`);

async function main() {
  try {
    console.clear();

    const banner = figlet.textSync("ANTI-NUKE", {
      font: "Standard",
      horizontalLayout: "default",
      verticalLayout: "default",
    });

    const boxContent = `${banner}\n\n💻 Rewritten by faiz4sure`;

    const styledBanner = boxen(boxContent, {
      title: "🚀 Discord Antinuke System",
      titleAlignment: "center",
      borderStyle: "bold",
      borderColor: "cyan",
      backgroundColor: "#001122",
      padding: 0,
      margin: 0,
      width: 70,
      textAlignment: "center",
      float: "center",
    });

    console.log(styledBanner);
    console.log("");

    await EventsHandler.loadEvents(client);

    client.on("error", (error) => {
      Logger.error(`Discord client error: ${error.message}`);
    });

    client.on("disconnect", () => {
      Logger.warn("Discord client disconnected");
    });

    client.on("reconnecting", () => {
      Logger.info("Discord client reconnecting...");
    });

    client.on("warn", (warning) => {
      Logger.warn(`Discord client warning: ${warning}`);
    });

    Logger.system("Attempting to login to Discord...");
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
