# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-01-28

### Added

- MFA token caching system (2-minute cache for faster subsequent reversions)
- Token validator for monitoring token health
- SQLite database system for persistent storage
- Rate limit event handler
- New vanity protection modes: `audit` and `fast`

### Changed

- Switched to client's internal API methods for vanity reversion (fixes ~99% of "password not match" errors)
- `audit` mode now recommended as default (most stable)
- `normal` and `fast` modes marked as unstable (under investigation)

### Fixed

- MFA authentication reliability improved significantly
- Reduced API request overhead during vanity reversion

## [1.1.0] - 2025-11-10

### Changed

- **Simplified vanity reversion approach**: Replaced complex cookie/session handling with direct 3-step MFA flow
- **Improved reliability**: Fixed "password does not match" errors by removing complex authentication logic
- **Performance**: Vanity reversion is now slightly faster with fewer HTTP requests

## [1.0.0] - 2025-11-02

### Added

- Initial release of Vantrix Discord Anti-Nuke Selfbot
- Vanity URL protection and automatic reversion
- Comprehensive anti-nuke protection suite
- Multi-server support
- Owner whitelisting system
- Configurable protection thresholds
- Logging and webhook notifications

### Features

- Real-time vanity URL change detection and reversion
- Mass ban/kick/channel/role deletion protection
- Automated punishment system
- Audit log analysis
- Rate limiting protection
- Beautiful startup banner and console output
