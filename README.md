# opencode-termux-notify

Termux notification plugin for [OpenCode](https://opencode.ai) on Android. Routes OpenCode attention events to `termux-notification` and `termux-media-player` via the OpenCode V2 plugin API (`@opencode-ai/plugin/v2/promise`).

[![npm version](https://img.shields.io/npm/v/opencode-termux-notify)](https://www.npmjs.com/package/opencode-termux-notify)
[![license](https://img.shields.io/npm/l/opencode-termux-notify)](./LICENSE)

## Features

- 6 notification kinds (default, question, permission, error, done, subagent_done) with distinct vibration and audio via `termux-media-player`
- Cross-instance deduplication via shared JSON file and stable notification IDs
- Spam prevention via event TTL (60s), per-session cooldown (5s), and global throttle (1s)
- Session-aware titles resolved from OpenCode session metadata
- Fully configurable: binaries, vibration, priority, cooldowns, kinds, and subagent handling

## Requirements

- Android + Termux with `termux-api` (`pkg install termux-api` and install Termux:API app)
- Node >= 20, OpenCode >= 1.18.27 (V2 plugin API)

## Install

```bash
opencode plugin add opencode-termux-notify
```

Add to `opencode.jsonc`:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-termux-notify"]
}
```

Local path (this repo):

```jsonc
// opencode.jsonc
{
  "plugins": ["/data/data/com.termux/files/home/opencode-termux-notify"]
}
```

## Usage

With options:

```jsonc
// opencode.jsonc
{
  "plugins": [{
    "package": "opencode-termux-notify",
    "options": {
      "kinds": ["question", "permission", "error", "done", "subagent_done"],
      "notifySubagents": true,
      "priority": "high"
    }
  }]
}
```

Restart OpenCode after editing config:

```bash
opencode service restart
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
