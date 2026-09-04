# opencode-termux-notify

Termux notification plugin for [OpenCode](https://opencode.ai) on Android. Routes OpenCode attention events to `termux-notification` and `termux-media-player`. **Default is V1 (`opencode`), V2 (`opencode2`) via `opencode-termux-notify/v2`.**

[![npm version](https://img.shields.io/npm/v/opencode-termux-notify)](https://www.npmjs.com/package/opencode-termux-notify)
[![license](https://img.shields.io/npm/l/opencode-termux-notify)](./LICENSE)

## Features

- 6 notification kinds (default, question, permission, error, done, subagent_done) with distinct vibration and audio via `termux-media-player` from Opencode
- Cross-instance deduplication via shared JSON file and stable notification IDs
- Spam prevention via event TTL (60s), per-session cooldown (5s), and global throttle (1s)
- Session-aware titles resolved from OpenCode session metadata
- Fully configurable: binaries, vibration, priority, cooldowns, kinds, and subagent handling

## Requirements

- Android + Termux with `termux-api` (`pkg install termux-api` and install Termux:API app)
- Node >= 20, OpenCode >= 1.18.27

## Install

**V1 (default) — `opencode` (1.18.27+):**

```bash
opencode plugin opencode-termux-notify        # latest
opencode plugin opencode-termux-notify -g      # install globally instead of per-project
```

Add to `opencode.json`:

```jsonc
// ~/.config/opencode/opencode.json  (V1: singular "plugin")
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-termux-notify"]
}
```

**V2 — `opencode2` (beta):**

```bash
opencode2 plugin add opencode-termux-notify/v2
```

Add to `opencode.jsonc` (`opencode.json(c)`):

```jsonc
// ~/.config/opencode/opencode.jsonc  (V2: plural "plugins")
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-termux-notify/v2"]
}
```

Local path (this repo) for V2 — must be a directory (`opencode.jsonc`):

```jsonc
// opencode.jsonc
{
  "plugins": ["/data/data/com.termux/files/home/opencode-termux-notify/v2"]
}
```

## Usage

With options (same for V1/V2, note `plugin` vs `plugins` and `opencode.json` vs `opencode.jsonc`):

```jsonc
// V1 — opencode.json
{
  "plugin": [["opencode-termux-notify", {
    "kinds": ["question", "permission", "error", "done", "subagent_done"],
    "notifySubagents": true,
    "priority": "high"
  }]]
}
// V2 — opencode.jsonc
{
  "plugins": [{
    "package": "opencode-termux-notify/v2",
    "options": {
      "kinds": ["question", "permission", "error", "done", "subagent_done"],
      "notifySubagents": true,
      "priority": "high"
    }
  }]
}
```

Restart the opencode after editing config:

```bash
opencode2 service restart
```

Grant notification permission on Android 13+ under Settings > Apps > Termux > Notifications. Verify with:

```bash
termux-notification --title test --content test --priority high --vibrate "400,200,400" --sound --id test
```

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `bin` | `string` | `/data/data/com.termux/files/usr/bin/termux-notification` | Notification binary |
| `mediaBin` | `string` | `/data/data/com.termux/files/usr/bin/termux-media-player` | Audio player binary |
| `sharedPath` | `string` | `os.tmpdir()/termux-notify-shared.json` | Deduplication file |
| `seenTTL` | `number` | `60000` | Event ID TTL (ms) |
| `sessionCooldown` | `number` | `5000` | Per-session debounce (ms) |
| `globalCooldown` | `number` | `1000` | Global throttle (ms) |
| `priority` | `string` | per-kind | Notification priority |
| `sound` | `boolean` | `true` | Enable sound |
| `playSound` | `boolean` | `true` | Play bundled mp3 |
| `vibrate` | `boolean` | `true` | Enable vibration |
| `requireTermux` | `boolean` | `true` | Warn if not in Termux |
| `kinds` | `string[]` | all kinds | Enabled event kinds |
| `notifySubagents` | `boolean` | `true` | Notify for subagents (false = sound only) |
| `title_<kind>` / `content_<kind>` | `string` | per-kind | Title/content override |

## Development

```bash
npm install
npm run typecheck
npm run build
```

## License

[MIT](./LICENSE)
