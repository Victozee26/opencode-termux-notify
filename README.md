# opencode-termux-notify

> Termux-native notifications for [OpenCode](https://opencode.ai) on Android — vibrate + sound alerts for all 6 attention sounds.

[![npm version](https://img.shields.io/npm/v/opencode-termux-notify)](https://www.npmjs.com/package/opencode-termux-notify)
[![license](https://img.shields.io/npm/l/opencode-termux-notify)](./LICENSE)
[![node](https://img.shields.io/node/v/opencode-termux-notify)](./package.json)

Built from a battle-tested global plugin that runs inside Termux on Android. Wires Opencode's 6 builtin attention sounds (`packages/tui/src/attention.ts`) to Termux:

| Sound | File | Trigger |
|---|---|---|
| `default` | `bip-bop-01.mp3` | generic idle |
| `question` | `bip-bop-03.mp3` | `question.asked` / `question.v2.asked` — agent needs input |
| `permission` | `staplebops-06.mp3` | `permission.asked` / `permission.v2.asked` — needs approval |
| `error` | `nope-03.mp3` | `session.error` / `execution.failed` |
| `done` | `bip-bop-01.mp3` | `session.status idle` (non-subagent) |
| `subagent_done` | `yup-01.mp3` | `session.status idle` (subagent, `parentID`) |

> `termux-notification --sound` is boolean only (no file arg — `termux-notification -h`). Custom mp3s are bundled at `assets/audio/` and played via `termux-media-player play <file>` alongside the notification (vibrate still via `--vibrate`).

Handles the duplicate-event storm OpenCode emits (`session.idle` / `execution.succeeded` / `status:idle` triple) with cross-instance deduplication, so you get **one** notification per completion, not three.

---

## Features

- 📳 **6 wired sounds** — `termux-notification --vibrate` per-kind + `termux-media-player` for bundled `bip-bop-*.mp3`/`staplebops`/`nope`/`yup`
- 🧠 **Cross-instance dedup** — works even when OpenCode loads the plugin 4× (global + project scopes) via a shared JSON file + stable `--id`
- 🔕 **No spam** — `event.id` TTL dedup (60s) + per-session cooldown (5s) + global throttle (1s) + `active` set tracking (mirrors `packages/tui/src/feature-plugins/system/notifications.ts`)
- 🏷️ **Session-aware titles** — resolves session `title`/`slug` so the notification tells you *which* session finished
- ⚠️ **Distinct haptics** — `error` `800,300,800,300,800` vs `question` `500,250,500` vs `permission` `600,200,600` vs `done` `400,200,400` vs `subagent_done` `200,100,200`
- ⚙️ **Fully configurable** — binary paths, vibrate, priority, titles, cooldowns, `kinds`, `notifySubagents`, `playSound`

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

With options (all 6 kinds):

```jsonc
{
  "plugins": [
    {
      "package": "opencode-termux-notify",
      "options": {
        "sound": true,          // termux-notification --sound + termux-media-player
        "playSound": true,       // set false to disable mp3 playback
        "kinds": ["default", "question", "permission", "error", "done", "subagent_done"],
        "notifySubagents": true, // false = sound-only for subagents (like TUI)
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
| `bin` | `string` | `/data/data/com.termux/files/usr/bin/termux-notification` | `termux-notification` binary |
| `mediaBin` | `string` | `/data/.../termux-media-player` | `termux-media-player` for mp3 playback |
| `sharedPath` | `string` | `os.tmpdir()/termux-notify-shared.json` | Cross-instance dedup file |
| `seenTTL` | `number` | `60000` | How long an `event.id` is remembered (ms) |
| `sessionCooldown` | `number` | `5000` | Per-session debounce window (ms) |
| `globalCooldown` | `number` | `1000` | Global throttle window (ms) |
| `priority` | `string` | _(per-kind)_ | Notification priority (`high`/`default`/`low`/`max`) — overrides `PRIORITY_BY_KIND` |
| `sound` | `boolean` | `true` | Pass `--sound` (boolean, `termux-notification -h` has no file arg) + enable mp3 |
| `playSound` | `boolean` | `true` | Play bundled `assets/audio/*.mp3` via `termux-media-player play` |
| `vibrate` | `boolean` | `true` | Pass `--vibrate` per-kind pattern |
| `requireTermux` | `boolean` | `true` | Warn if not in Termux |
| `kinds` | `string[]` | `["default","question","permission","error","done","subagent_done"]` | Which sounds to notify on (also supports legacy `["idle","error"]`) |
| `notifySubagents` | `boolean` | `true` | If `false`, `subagent_done` is sound-only (mirrors TUI) |
| `title_<kind>` / `content_<kind>` | `string` | _(per-kind)_ | Title/content override e.g. `title_question`, `content_error` |

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
                                     ├─ classify:
                                     │   question.asked / v2 → question (bip-bop-03.mp3, vibrate 500,250,500)
                                     │   permission.asked / v2 → permission (staplebops-06.mp3, 600,200,600)
                                     │   session.error / execution.failed → error (nope-03.mp3, 800,300,800,300,800)
                                     │   session.status idle → done (bip-bop-01.mp3, 400,200,400) or subagent_done (yup-01.mp3, 200,100,200)
                                     │   session.idle / execution.succeeded → done
                                     ├─ active/errored tracking (mirrors packages/tui/src/feature-plugins/system/notifications.ts)
                                     ├─ shouldNotifyShared(evtId, sessionKey)
                                     │     ├─ seen[event.id] TTL 60s        — server duplicate
                                     │     ├─ lastBySession[session:kind] 5s — triple suppression
                                     │     └─ lastGlobal 1s                  — cross-session burst
                                     ├─ ctx.session.get(sessionID) → title/slug + parentID check
                                     └─ spawn termux-notification --id opencode-<session>-<kind> --vibrate ... --sound
                                        + spawn termux-media-player play assets/audio/<kind>.mp3
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
- `termux-notification --sound` is boolean only — custom `assets/audio/*.mp3` needs `termux-media-player` (`pkg install termux-api` already provides it). Test: `termux-media-player play assets/audio/bip-bop-01.mp3` then `termux-media-player info`.
- Check `termux-notification -h` — there is no `--sound <file>`, only `--sound`. The plugin bundles the 5 mp3s and plays them via `termux-media-player` automatically.

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
