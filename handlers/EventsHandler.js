import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import terminal from "terminal-kit";
import Logger from "../utils/Logger.js";

const { terminal: term } = terminal;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EventsHandler {
  constructor() {
    this.events = new Map();
    this.eventCount = 0;
    this.folders = ["client", "security"];
  }

  async loadEvents(client) {
    Logger.system("Loading event handlers...");
    const eventsDir = path.join(__dirname, "../events");
    if (!fs.existsSync(eventsDir)) {
      Logger.warn("Events directory not found");
      return;
    }

    let totalFiles = 0;
    for (const folder of this.folders) {
      const folderPath = path.join(eventsDir, folder);
      if (!fs.existsSync(folderPath)) continue;
      totalFiles += fs
        .readdirSync(folderPath)
        .filter((f) => f.endsWith(".js") && !f.startsWith(".")).length;
    }
    if (totalFiles === 0) {
      Logger.warn("No event files found");
      return;
    }

    Logger.info(`Found ${totalFiles} event files`);
    const progressBar = term.progressBar({
      width: 50,
      title: "Loading Events:",
      eta: true,
      percent: true,
      inline: false,
    });
    let loadedCount = 0;
    term.eraseDisplayBelow();

    for (const folder of this.folders) {
      const folderPath = path.join(eventsDir, folder);
      if (!fs.existsSync(folderPath)) continue;
      const files = fs
        .readdirSync(folderPath)
        .filter((f) => f.endsWith(".js") && !f.startsWith("."))
        .sort();
      if (files.length === 0) continue;

      for (const file of files) {
        try {
          const filePath = path.join(folderPath, file);
          const { default: eventModule } = await import(`file://${filePath}`);
          if (!eventModule?.name || !eventModule?.execute) continue;

          const useOnce = eventModule.once || false;
          if (useOnce)
            client.once(eventModule.name, (...args) =>
              eventModule.execute(client, ...args)
            );
          else
            client.on(eventModule.name, (...args) =>
              eventModule.execute(client, ...args)
            );

          this.events.set(eventModule.name, {
            file,
            folder,
            once: useOnce,
            path: filePath,
          });
          this.eventCount++;
          loadedCount++;
          progressBar.update({
            progress: loadedCount / totalFiles,
            title: `Loading: ${folder}/${file}`,
          });
        } catch (error) {
          Logger.error(`Failed to load ${file}: ${error.message}`);
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    progressBar.update({ progress: 1, title: "Loading Events: Complete!" });
    await new Promise((r) => setTimeout(r, 500));
    term.eraseDisplayBelow();
    Logger.success(`Loaded ${this.eventCount} event handlers`);
  }

  getStats() {
    return {
      total: this.eventCount,
      categories: [...new Set([...this.events.values()].map((e) => e.folder))],
      events: Object.fromEntries(this.events),
    };
  }
  hasEvent(eventName) {
    return this.events.has(eventName);
  }
  getEvent(eventName) {
    return this.events.get(eventName) || null;
  }
}

export default new EventsHandler();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
