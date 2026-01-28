import Logger from "../utils/Logger.js";
import { closeDb } from "../utils/db.js";

class Anticrash {
  constructor() {
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    Logger.system("Initializing anticrash protection...");

    process.on("uncaughtException", (error) => {
      Logger.error(`UNCAUGHT EXCEPTION: ${error.message}`);
      if (error.stack)
        Logger.error(error.stack.split("\n").slice(0, 5).join("\n"));
      this.logErrorToFile(error, "uncaughtException");
    });

    process.on("unhandledRejection", (reason) => {
      Logger.error(
        `UNHANDLED REJECTION: ${
          reason instanceof Error ? reason.message : String(reason)
        }`
      );
      if (reason instanceof Error && reason.stack)
        Logger.error(reason.stack.split("\n").slice(0, 5).join("\n"));
    });

    process.on("warning", (warning) => {
      if (
        warning.name === "ExperimentalWarning" ||
        warning.name === "DeprecationWarning"
      )
        return;
      Logger.warn(`${warning.name}: ${warning.message}`);
    });

    process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));
    process.on("SIGHUP", () => this.gracefulShutdown("SIGHUP"));

    this.initialized = true;
    Logger.success("Anticrash protection initialized");
  }

  async logErrorToFile(error, type) {
    try {
      const fs = await import("fs");
      fs.appendFileSync(
        "crash.log",
        `[${new Date().toISOString()}] [${type}] ${error.message}\n`
      );
    } catch (e) {}
  }

  async gracefulShutdown(signal) {
    try {
      Logger.system(`Shutting down (${signal})...`);
      try {
        closeDb();
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
      process.exit(0);
    } catch (e) {
      process.exit(1);
    }
  }

  isInitialized() {
    return this.initialized;
  }
}

export default new Anticrash();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
