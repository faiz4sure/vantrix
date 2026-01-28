import Logger from "./Logger.js";

class MfaTokenCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 270000;
    this.timeouts = new Map();
    this.inProgress = new Map();
  }

  init() {
    Logger.debug("MFA Token Cache initialized");
  }

  get(guildId) {
    const entry = this.cache.get(guildId);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.delete(guildId);
      return null;
    }
    return entry.token;
  }

  set(guildId, token) {
    if (this.timeouts.has(guildId)) {
      clearTimeout(this.timeouts.get(guildId));
      this.timeouts.delete(guildId);
    }
    this.cache.set(guildId, { token, expires: Date.now() + this.ttl });
    const timeout = setTimeout(() => {
      this.cache.delete(guildId);
      this.timeouts.delete(guildId);
    }, this.ttl);
    if (timeout.unref) timeout.unref();
    this.timeouts.set(guildId, timeout);
  }

  isInProgress(guildId) {
    return this.inProgress.get(guildId) === true;
  }
  setInProgress(guildId, status) {
    status
      ? this.inProgress.set(guildId, true)
      : this.inProgress.delete(guildId);
  }
  invalidate(guildId) {
    this.delete(guildId);
    this.inProgress.delete(guildId);
  }

  delete(guildId) {
    this.cache.delete(guildId);
    if (this.timeouts.has(guildId)) {
      clearTimeout(this.timeouts.get(guildId));
      this.timeouts.delete(guildId);
    }
  }

  destroy() {
    for (const [, timeout] of this.timeouts) clearTimeout(timeout);
    this.cache.clear();
    this.timeouts.clear();
    this.inProgress.clear();
  }

  stats() {
    return { size: this.cache.size, inProgress: this.inProgress.size };
  }
}

const mfaTokenCache = new MfaTokenCache();
export default mfaTokenCache;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
