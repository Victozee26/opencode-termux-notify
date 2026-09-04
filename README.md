# opencode-termux-notify

> Termux-native notifications for [OpenCode](https://opencode.ai) on Android — get a vibrate + sound alert when your agent session goes idle or errors.

[![npm version](https://img.shields.io/npm/v/opencode-termux-notify)](https://www.npmjs.com/package/opencode-termux-notify)
[![license](https://img.shields.io/npm/l/opencode-termux-notify)](./LICENSE)
[![node](https://img.shields.io/node/v/opencode-termux-notify)](./package.json)

Built from a battle-tested global plugin that runs inside Termux on Android. Handles the duplicate-event storm OpenCode emits (`session.idle` / `execution.succeeded` / `status:idle` triple) with cross-instance deduplication, so you get **one** notification per completion, not three.

---

## Features

- 📳 **Vibrate + sound** via `termux-notification` (`--vibrate`, `--sound`, `--priority high`)
- 🧠 **Cross-instance dedup** — works even when OpenCode loads the plugin 4× (global + project scopes) via a shared JSON file + stable `--id`
- 🔕 **No spam** — `event.id` TTL dedup (60s) + per-session cooldown (5s) + global throttle (1s)
- 🏷️ **Session-aware titles** — resolves session `title`/`slug` so the notification tells you *which* session finished
- ⚠️ **Distinct error haptics** — longer vibrate pattern for errors (`800,300,800,300,800` vs `400,200,400`)
- ⚙️ **Fully configurable** — binary path, vibrate patterns, priority, titles, cooldowns, shared state path

## Requirements

- **Android + Termux** with `termux-api` installed
- `termux-notification` on `PATH` (install: `pkg install termux-api` + install [Termux:API app](https://github.com/termux/termux-api))
- **Node ≥ 20**, **OpenCode ≥ 1.18.27**
- `@opencode-ai/plugin` (installed automatically as dependency)

> Running OpenCode outside Termux (e.g. in a remote dev container) will warn but still load — set `requireTermux: false` to silence the warning if you forward notifications differently.

## Install

```bash
npm install opencode-termux-notify
# or
pnpm add opencode-termux-notify
yarn add opencode-termux-notify
bun add opencode-termux-notify
```

## Usage

### 1. Register the plugin in `opencode.json`

Global (recommended for Termux — applies to every project):

```jsonc
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-termux-notify"]
}
```

Project-local:

```jsonc
// ./opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-termux-notify"]
}
```

With options:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-termux-notify",
      "options": {
        "sound": true,
        "vibrateIdle": "400,200,400",
        "vibrateError": "800,300,800,300,800",
        "kinds": ["idle", "error"],
        "priority": "high"
      }
    }
  ]
}
```

Restart the OpenCode service after editing config:

```bash
opencode2 service restart
opencode2 service status
```

### 2. Grant notification permission

On Android 13+ enable notifications for Termux in **Settings → Apps → Termux → Notifications**.

Verify manually:

```bash
termux-notification --title "test" --content "hello" --priority high --vibrate "400,200,400" --sound --id test
```

If that shows a notification, the plugin will too.

## Configuration

All options are passed via `ctx.options` (the `options` object in `opencode.json`):

| Option | Type | Default | Description |
|---|---|---|---|
| `bin` | `string` | `/data/data/com.termux/files/usr/bin/termux-notification` | Absolute path to `termux-notification` |
| `sharedPath` | `string` | `os.tmpdir()/termux-notify-shared.json` | Cross-instance dedup file |
| `seenTTL` | `number` | `60000` | How long an `event.id` is remembered (ms) |
| `sessionCooldown` | `number` | `5000` | Per-session debounce window (ms) |
| `globalCooldown` | `number` | `1000` | Global throttle window (ms) |
| `vibrateIdle` | `string` | `"400,200,400"` | Vibrate pattern for idle |
| `vibrateError` | `string` | `"800,300,800,300,800"` | Vibrate pattern for error |
| `priority` | `string` | `"high"` | Notification priority (`high`/`default`/`low`/`max`) |
| `sound` | `boolean` | `true` | Pass `--sound` |
| `requireTermux` | `boolean` | `true` | Warn if not in Termux |
| `kinds` | `string[]` | `["idle","error"]` | Which events to notify on |
| `titleIdle` / `titleError` | `string` | `OpenCode — <session>` | Title override |
| `contentIdle` / `contentError` | `string` | `Session finished ✅` etc | Content override |

Example — only error notifications, custom title:

```jsonc
{
  "plugins": [{
    "package": "opencode-termux-notify",
    "options": {
      "kinds": ["error"],
      "titleError": "Build failed — check Termux",
      "sessionCooldown": 10000
    }
  }]
}
```

## How it works

```
OpenCode server ──event stream──► plugin (ctx.event.subscribe)
                                     │
                                     ├─ classify: idle (session.idle / execution.succeeded / status:idle)
                                     │         error (session.error / execution.failed / step.failed)
                                     ├─ shouldNotifyShared(evtId, sessionKey)
                                     │     ├─ seen[event.id] TTL 60s        — server duplicate
                                     │     ├─ lastBySession[session:kind] 5s — triple suppression
                                     │     └─ lastGlobal 1s                  — cross-session burst
                                     ├─ ctx.session.get(sessionID) → title/slug
                                     └─ spawn termux-notification --id opencode-<session>-<kind> ...
```

`--id` is stable per session+kind, so an update overwrites the previous notification instead of stacking. `--alert-once` is intentionally *not* used — it would suppress vibrate/sound on updates.

Shared state is stored atomically (`write tmp + rename`) at `sharedPath`. It self-prunes at 300 keys.

## Troubleshooting

**No notification at all**
- Run `termux-notification --title test --content test --id test --sound` manually. If it fails, install `termux-api` (`pkg install termux-api` + companion app) and grant notification permission.
- Check OpenCode logs: `cat ~/.local/share/opencode/log/opencode.log | grep termux-notify`
- Ensure the plugin is loaded: `opencode2 api get /api/plugin/list` or check `opencode.log` for `termux-notify`

**Duplicate notifications**
- Should be fixed in ≥1.0.0. If you still see duplicates, check `cat /tmp/termux-notify-shared.json` (or your `sharedPath`) — ensure the file is writable and not on a read-only tmpfs.
- Open an issue with the log snippet around `termux-notify`.

**Notifications stacking instead of updating**
- Expected per-session behaviour is one `idle` + one `error` notification (distinct `--id`). Different sessions each get their own notification.

**Vibrate/sound not playing**
- Android battery optimization may silence Termux. Exempt Termux from optimization in Android settings.
- Some vendors require `--priority max`. Try setting `"priority": "max"`.

## Development

```bash
git clone https://github.com/Victozee26/opencode-termux-notify
cd opencode-termux-notify
npm install
npm run typecheck   # tsc --noEmit
npm run pack:dry    # preview tarball
```

Local dev link:

```bash
# in plugin repo
npm link
# in a test project
npm link opencode-termux-notify
# add to opencode.json -> plugins: ["opencode-termux-notify"]
opencode2 service restart
```

## Publishing (maintainers)

```bash
npm version patch|minor|major
npm publish --provenance --access public
```

The `prepublishOnly` hook runs `typecheck`. Update `CHANGELOG.md` before publishing.

## Acknowledgments

- Built for [OpenCode](https://opencode.ai) — an open source AI coding agent.
- Uses the [`@opencode-ai/plugin`](https://www.npmjs.com/package/@opencode-ai/plugin) SDK (`Plugin.define`).

## License

[MIT](./LICENSE) © opencode-termux-notify contributors
