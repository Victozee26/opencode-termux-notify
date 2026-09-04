# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-04

### Added
- Initial npm release, extracted from `~/.config/opencode/plugins/termux-notify`
- `Plugin.define` entrypoint using `@opencode-ai/plugin` (`^1.18.27`, `v2/promise`)
- Cross-instance deduplication via shared JSON file + stable `termux-notification --id`
- Per-session cooldown (5s), global throttle (1s), `event.id` TTL (60s) + `active`/`errored` tracking (mirrors `packages/tui/src/feature-plugins/system/notifications.ts:59-86`)
- Session-aware titles via `ctx.session.get` + `parentID` check for `subagent_done`
- 6 wired attention sounds (from `packages/tui/src/attention.ts:19-60` + `packages/ui/src/assets/audio/`):
  - `default` → `bip-bop-01.mp3` (400,200,400)
  - `question` → `bip-bop-03.mp3` (500,250,500) on `question.asked`/`v2`
  - `permission` → `staplebops-06.mp3` (600,200,600) on `permission.asked`/`v2`
  - `error` → `nope-03.mp3` (800,300,800,300,800)
  - `done` → `bip-bop-01.mp3` (400,200,400)
  - `subagent_done` → `yup-01.mp3` (200,100,200) — obeys `notifySubagents` (default true, `false` = sound-only like TUI)
- Bundled mp3 assets at `assets/audio/*.mp3` + playback via `termux-media-player play` (`termux-notification --sound` is boolean only — see `termux-notification -h`)
- Configurable via `opencode.json` `options`: `bin`, `mediaBin`, `sharedPath`, `seenTTL`, `sessionCooldown`, `globalCooldown`, `sound`, `playSound`, `vibrate`, `priority`, `requireTermux`, `kinds` (6), `notifySubagents`, `title_<kind>`/`content_<kind>`
- TypeScript source (`src/index.ts`) + runtime JS (`src/index.js`) + types (`src/index.d.ts`)
- Professional package scaffolding: README, LICENSE (MIT), CHANGELOG, `.gitignore`, `tsconfig.json`

[1.0.0]: https://github.com/Victozee26/opencode-termux-notify/releases/tag/v1.0.0
