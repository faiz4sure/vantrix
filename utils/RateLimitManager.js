import Logger from "./Logger.js";

class RateLimitManager {
  constructor() {
    this.pendingRequests = {};
    this.requestQueue = {};
    this.rateLimitInfo = {
      global: { limited: false, resetTime: 0 },
      routes: {},
    };
  }

  async execute(routeId, func, args = [], options = {}) {
    const {
      retryLimit = 3,
      initialBackoff = 1000,
      maxBackoff = 60000,
    } = options;

    if (this.rateLimitInfo.global.limited) {
      const now = Date.now();
      if (now < this.rateLimitInfo.global.resetTime) {
        await this.sleep(this.rateLimitInfo.global.resetTime - now);
      } else {
        this.rateLimitInfo.global.limited = false;
      }
    }

    if (this.rateLimitInfo.routes[routeId]?.limited) {
      const now = Date.now();
      if (now < this.rateLimitInfo.routes[routeId].resetTime) {
        await this.sleep(this.rateLimitInfo.routes[routeId].resetTime - now);
      } else {
        this.rateLimitInfo.routes[routeId] = { limited: false, resetTime: 0 };
      }
    }

    if (this.pendingRequests[routeId]) {
      if (!this.requestQueue[routeId]) this.requestQueue[routeId] = [];
      return new Promise((resolve, reject) => {
        this.requestQueue[routeId].push({ resolve, reject, func, args });
      });
    }

    this.pendingRequests[routeId] = true;
    let retries = 0;
    let lastError = null;

    while (retries <= retryLimit) {
      try {
        const result = await func(...args);
        this.pendingRequests[routeId] = false;
        this.processQueue(routeId);
        return result;
      } catch (error) {
        lastError = error;
        if (error.code === 429) {
          const waitTime = (error.retry_after || 1) * 1000;
          if (error.global) {
            this.rateLimitInfo.global.limited = true;
            this.rateLimitInfo.global.resetTime = Date.now() + waitTime;
          } else {
            if (!this.rateLimitInfo.routes[routeId])
              this.rateLimitInfo.routes[routeId] = {
                limited: false,
                resetTime: 0,
              };
            this.rateLimitInfo.routes[routeId].limited = true;
            this.rateLimitInfo.routes[routeId].resetTime =
              Date.now() + waitTime;
          }
          await this.sleep(waitTime);
          retries++;
          continue;
        }

        if (retries < retryLimit) {
          const backoff = Math.min(
            maxBackoff,
            initialBackoff * Math.pow(2, retries)
          );
          await this.sleep(backoff);
          retries++;
        } else {
          this.pendingRequests[routeId] = false;
          this.processQueue(routeId);
          throw error;
        }
      }
    }

    this.pendingRequests[routeId] = false;
    this.processQueue(routeId);
    throw lastError;
  }

  processQueue(routeId) {
    if (!this.requestQueue[routeId]?.length) return;
    const next = this.requestQueue[routeId].shift();
    this.pendingRequests[routeId] = true;
    next
      .func(...next.args)
      .then((r) => {
        this.pendingRequests[routeId] = false;
        next.resolve(r);
        this.processQueue(routeId);
      })
      .catch((e) => {
        this.pendingRequests[routeId] = false;
        next.reject(e);
        this.processQueue(routeId);
      });
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  getStats() {
    return {
      globalLimited: this.rateLimitInfo.global.limited,
      globalResetTime: this.rateLimitInfo.global.resetTime,
      routeLimits: Object.keys(this.rateLimitInfo.routes).length,
      pendingRequests: Object.keys(this.pendingRequests).filter(
        (k) => this.pendingRequests[k]
      ).length,
    };
  }
}

const rateLimitManager = new RateLimitManager();
export default rateLimitManager;

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
