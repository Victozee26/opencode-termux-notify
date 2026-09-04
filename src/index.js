/**
 * opencode-termux-notify — Termux-native notifications for OpenCode (V2)
 *
 * Fires `termux-notification` + `termux-media-player` with the 6 builtin
 * attention sounds:
 *   default       → bip-bop-01.mp3
 *   question      → bip-bop-03.mp3
 *   permission    → staplebops-06.mp3
 *   error         → nope-03.mp3
 *   done          → bip-bop-01.mp3
 *   subagent_done → yup-01.mp3
 *
 * Dedup: event.id TTL 60s + per-session cooldown 5s + global 1s + stable --id
 * Audio: bundled at assets/audio/*.mp3, played via `termux-media-player play <file>`
 *        (termux-notification --sound is boolean only — no file arg, see `termux-notification -h`)
 *
 * @see https://github.com/Victozee26/opencode-termux-notify
 */

import { define } from "@opencode-ai/plugin/v2/promise"
import { playAudio } from "./audio.js"
import { getEnabledKinds, getContent, getTitle, resolveOpts } from "./config.js"
import { shouldNotifyShared } from "./dedup.js"
import { isTermuxEnvironment } from "./env.js"
import { classifyEvent } from "./events.js"
import { notify } from "./notify.js"
import { DEFAULTS, PRIORITY_BY_KIND, SOUND_FILES, VIBRATE_PATTERNS } from "./constants.js"

export { DEFAULTS, PRIORITY_BY_KIND, SOUND_FILES, VIBRATE_PATTERNS }

export default define({
  id: "termux-notify",
  setup: async (ctx) => {
    const userOpts = (ctx.options ?? {})
    const opts = resolveOpts(userOpts)
    const enabledKinds = getEnabledKinds(userOpts)

    if (opts.requireTermux && !isTermuxEnvironment()) {
      console.warn("[termux-notify] Not in Termux (TERMUX_VERSION/PREFIX missing) — plugin will still listen but notifications may fail. Set { requireTermux:false } to silence this.")
    }

    if (!ctx?.event?.subscribe) {
      console.error("[termux-notify] ctx.event.subscribe not available — check OpenCode version >= 1.18")
      return () => {}
    }

    const controller = new AbortController()
    const events = ctx.event.subscribe({ signal: controller.signal })

    const active = new Set()
    const errored = new Set()

    void (async () => {
      try {
        for await (const event of events) {
          if (!event?.type) continue

          if (event.type === "session.status") {
            const sid = event.properties?.sessionID
            if (!sid) continue
            const st = event.properties?.status?.type
            if (st === "busy" || st === "retry") {
              active.add(sid)
              errored.delete(sid)
              continue
            }
            if (st !== "idle") continue
            if (!active.has(sid)) continue
            active.delete(sid)
            if (errored.has(sid)) {
              errored.delete(sid)
              continue
            }
          }
          if (event.type === "session.error") {
            const sid = event.properties?.sessionID
            if (sid && active.has(sid)) errored.add(sid)
          }

          const classified = await classifyEvent(event, ctx)
          if (!classified) continue

          const { kind, sound, sessionID } = classified
          if (!enabledKinds.has(kind) && !enabledKinds.has(sound)) continue

          const evtId = classified.evtId
          const sessionKey = `${sessionID}:${kind}`

          const ok = await shouldNotifyShared(evtId, sessionKey, opts)
          if (!ok) continue

          const nid = `opencode-${sessionID}-${kind}`

          let sessionName = sessionID.slice(0, 8)
          try {
            if (ctx?.session?.get) {
              const info = await ctx.session.get({ sessionID })
              const raw = info?.info || info?.data || info
              const candidate = raw?.title || raw?.slug || raw?.summary?.title || raw?.id
              if (candidate && typeof candidate === "string" && candidate.trim()) {
                sessionName = candidate.trim().slice(0, 40)
              }
            }
          } catch {}

          const title = getTitle(kind, sessionName, userOpts)
          const content = getContent(kind, userOpts)

          const notifySubagents = userOpts.notifySubagents !== false
          if (kind === "subagent_done" && !notifySubagents) {
            await playAudio(sound, opts)
            continue
          }

          try {
            await notify(title, content, nid, sound, opts)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[termux-notify] Failed to send ${kind} notification:`, msg)
          }
        }
      } catch (e) {
        if (e?.name !== "AbortError") console.error("[termux-notify] event loop error:", e)
      }
    })()

    return () => controller.abort()
  },
})
