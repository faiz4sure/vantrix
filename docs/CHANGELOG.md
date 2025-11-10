# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
