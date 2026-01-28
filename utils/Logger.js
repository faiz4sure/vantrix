import kleur from "kleur";
import fs from "fs";
import path from "path";

class Logger {
  constructor() {
    this.colors = {
      info: kleur.blue,
      error: kleur.red,
      success: kleur.green,
      system: kleur.cyan,
      debug: kleur.magenta,
      warn: kleur.yellow,
    };
    this.prefixes = {
      info: kleur.blue("[INFO]"),
      error: kleur.red("[ERROR]"),
      success: kleur.green("[SUCCESS]"),
      system: kleur.cyan("[SYSTEM]"),
      debug: kleur.magenta("[DEBUG]"),
      warn: kleur.yellow("[WARN]"),
    };
    this.levels = {
      error: 1,
      warning: 2,
      success: 2,
      info: 3,
      system: 3,
      debug: 4,
    };
    this.fileLoggingEnabled = false;
    this.logFiles = {
      debug: "debug.txt",
      error: "errors.txt",
      warn: "warn.txt",
    };
    this.initializeFileLogging();
  }

  initializeFileLogging() {
    try {
      const dataDir = "data";
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      for (const file of Object.values(this.logFiles)) {
        const filePath = path.join(dataDir, file);
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
        else fs.writeFileSync(filePath, "", "utf8");
      }
      this.fileLoggingEnabled = true;
    } catch (e) {
      this.fileLoggingEnabled = false;
    }
  }

  writeToFile(level, message) {
    if (!this.fileLoggingEnabled || !this.logFiles[level]) return;
    try {
      fs.appendFileSync(
        path.join("data", this.logFiles[level]),
        `[${this.getTimestamp()}] ${message}\n`,
        "utf8"
      );
    } catch (e) {
      if (e.code === "ENOENT") this.fileLoggingEnabled = false;
    }
  }

  shouldLog(level) {
    if (!global.config) return true;
    const configLevel = global.config.logs?.log_level || "info";
    return (this.levels[level] || 3) <= (this.levels[configLevel] || 3);
  }

  getTimestamp() {
    return new Date().toISOString().replace("T", " ").slice(0, -5);
  }

  formatMessage(level, message) {
    const useTimestamp = global.config?.logs?.timestamp !== false;
    const prefix = this.prefixes[level] || kleur.white("[UNKNOWN]");
    const coloredMessage = this.colors[level]
      ? this.colors[level](message)
      : message;
    return useTimestamp
      ? `${kleur.gray(`[${this.getTimestamp()}]`)} ${prefix} ${coloredMessage}`
      : `${prefix} ${coloredMessage}`;
  }

  info(message) {
    if (this.shouldLog("info"))
      console.log(this.formatMessage("info", message));
  }
  error(message) {
    if (this.shouldLog("error"))
      console.log(this.formatMessage("error", message));
    this.writeToFile("error", `[ERROR] ${message}`);
  }
  success(message) {
    if (this.shouldLog("success"))
      console.log(this.formatMessage("success", message));
  }
  system(message) {
    if (this.shouldLog("system"))
      console.log(this.formatMessage("system", message));
  }
  debug(message) {
    if (this.shouldLog("debug"))
      console.log(this.formatMessage("debug", message));
    this.writeToFile("debug", `[DEBUG] ${message}`);
  }
  warn(message) {
    if (this.shouldLog("warning"))
      console.log(this.formatMessage("warn", message));
    this.writeToFile("warn", `[WARN] ${message}`);
  }
  raw(message) {
    console.log(message);
  }
  blank() {
    console.log("");
  }
}

export default new Logger();

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
