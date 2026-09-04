# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-04

### Added
- Initial npm release, extracted from `~/.config/opencode/plugins/termux-notify`
- `Plugin.define` entrypoint using `@opencode-ai/plugin` (`^1.18.27`)
- Cross-instance deduplication via shared JSON file + stable `termux-notification --id`
- Per-session cooldown (5s), global throttle (1s), `event.id` TTL (60s)
- Session-aware titles via `ctx.session.get`
- Distinct vibrate patterns for idle vs error, optional `--sound` and `--priority`
- Configurable via `opencode.json` `options`: `bin`, `sharedPath`, `seenTTL`, `sessionCooldown`, `globalCooldown`, `vibrateIdle`, `vibrateError`, `priority`, `sound`, `requireTermux`, `kinds`, `titleIdle`/`titleError`, `contentIdle`/`contentError`
- TypeScript source (`src/index.ts`) + runtime JS (`src/index.js`) + types (`src/index.d.ts`)
- Professional package scaffolding: README, LICENSE (MIT), CHANGELOG, `.gitignore`, `tsconfig.json`

[1.0.0]: https://github.com/Victozee26/opencode-termux-notify/releases/tag/v1.0.0
