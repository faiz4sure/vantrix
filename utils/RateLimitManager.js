

import Logger from './Logger.js';

class RateLimitManager {
    constructor() {
        this.pendingRequests = {};
        this.requestQueue = {};
        this.rateLimitInfo = {
            global: {
                limited: false,
                resetTime: 0
            },
            routes: {}
        };
    }

    
    async execute(routeId, func, args = [], options = {}) {
        const {
            retryLimit = 3,
            initialBackoff = 1000,
            maxBackoff = 60000,
            logFunction = Logger.debug
        } = options;

        
        if (this.rateLimitInfo.global.limited) {
            const now = Date.now();
            if (now < this.rateLimitInfo.global.resetTime) {
                const waitTime = this.rateLimitInfo.global.resetTime - now;
                Logger.warn(`Global rate limit in effect. Waiting ${waitTime}ms before retrying...`);
                await this.sleep(waitTime);
            } else {
                this.rateLimitInfo.global.limited = false;
            }
        }

        
        if (this.rateLimitInfo.routes[routeId]?.limited) {
            const now = Date.now();
            if (now < this.rateLimitInfo.routes[routeId].resetTime) {
                const waitTime = this.rateLimitInfo.routes[routeId].resetTime - now;
                Logger.warn(`Rate limit hit for ${routeId}! Waiting ${waitTime}ms before retrying...`);
                await this.sleep(waitTime);
            } else {
                this.rateLimitInfo.routes[routeId] = { limited: false, resetTime: 0 };
            }
        }

        
        if (this.pendingRequests[routeId]) {
            if (!this.requestQueue[routeId]) {
                this.requestQueue[routeId] = [];
            }

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
                    const retryAfter = error.retry_after || 1;
                    const waitTime = retryAfter * 1000;

                    if (error.global) {
                        this.rateLimitInfo.global.limited = true;
                        this.rateLimitInfo.global.resetTime = Date.now() + waitTime;
                        Logger.warn(`Global rate limit hit! Waiting ${waitTime}ms before retrying...`);
                    } else {
                        if (!this.rateLimitInfo.routes[routeId]) {
                            this.rateLimitInfo.routes[routeId] = { limited: false, resetTime: 0 };
                        }

                        this.rateLimitInfo.routes[routeId].limited = true;
                        this.rateLimitInfo.routes[routeId].resetTime = Date.now() + waitTime;
                        Logger.warn(`Rate limit hit for ${routeId}! Waiting ${waitTime}ms before retrying...`);
                    }

                    await this.sleep(waitTime);
                    retries++; 
                    continue;
                }

                
                if (retries < retryLimit) {
                    const backoff = Math.min(maxBackoff, initialBackoff * Math.pow(2, retries));
                    Logger.warn(`Request to ${routeId} failed (${error.message}${error.code ? `, Code: ${error.code}` : ''}), retrying in ${backoff}ms...`);
                    await this.sleep(backoff);
                    retries++;
                } else {
                    Logger.error(`Request to ${routeId} failed permanently after ${retryLimit} retries: ${error.message}${error.code ? ` (Code: ${error.code})` : ''}`);
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
        if (!this.requestQueue[routeId] || this.requestQueue[routeId].length === 0) {
            return;
        }

        const nextRequest = this.requestQueue[routeId].shift();
        this.pendingRequests[routeId] = true;

        nextRequest.func(...nextRequest.args)
            .then(result => {
                this.pendingRequests[routeId] = false;
                nextRequest.resolve(result);
                this.processQueue(routeId);
            })
            .catch(error => {
                this.pendingRequests[routeId] = false;
                nextRequest.reject(error);
                this.processQueue(routeId);
            });
    }

    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    
    getStats() {
        return {
            globalLimited: this.rateLimitInfo.global.limited,
            globalResetTime: this.rateLimitInfo.global.resetTime,
            routeLimits: Object.keys(this.rateLimitInfo.routes).length,
            pendingRequests: Object.keys(this.pendingRequests).filter(key => this.pendingRequests[key]).length
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