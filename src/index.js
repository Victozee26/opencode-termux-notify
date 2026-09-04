/**
 * opencode-termux-notify — Termux-native notifications for OpenCode (V2)
 *
 * Fires a `termux-notification` with vibrate + sound when an OpenCode session
 * goes idle (succeeded) or errors, with robust cross-instance deduplication.
 *
 * Loaded via `opencode.json`:
 * ```jsonc
 * { "plugins": ["opencode-termux-notify"] }
 * // or with options:
 * { "plugins": [{ "package": "opencode-termux-notify", "options": { "sound": true } }] }
 * ```
 *
 * Deduplication strategy (why you won't get 3× notifications):
 * - dedup by `event.id` (server emits duplicates) with TTL
 * - per-session cooldown (session.idle / execution.succeeded / status:idle triple)
 * - cross-process shared JSON file + stable `termux-notification --id`
 *
 * @see https://github.com/Victozee26/opencode-termux-notify
 */

import { readFile, writeFile, rename } from "node:fs/promises"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { define } from "@opencode-ai/plugin/v2/promise"

// ── defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  /** Absolute path to termux-notification binary */
  bin: "/data/data/com.termux/files/usr/bin/termux-notification",
  /** Where cross-instance dedup state lives */
  sharedPath: join(tmpdir(), "termux-notify-shared.json"),
  /** How long an event.id is remembered (ms) */
  seenTTL: 60_000,
  /** Ignore repeated idle/error for same session within this window (ms) */
  sessionCooldown: 5_000,
  /** Global throttle across all sessions (ms) */
  globalCooldown: 1_000,
  vibrateIdle: "400,200,400",
  vibrateError: "800,300,800,300,800",
  priority: "high",
  sound: true,
  /** If false, skip warning when not running inside Termux */
  requireTermux: true,
}

// ── shared dedup ──────────────────────────────────────────────────────────

/**
 * @param {string} evtId
 * @param {string} sessionKey  `${sessionID}:${kind}`
 * @param {typeof DEFAULTS} opts
 * @returns {Promise<boolean>} true if caller should notify
 */
async function shouldNotifyShared(evtId, sessionKey, opts) {
  const now = Date.now()
  let state = { seen: {}, lastBySession: {}, lastGlobal: 0 }

  try {
    const raw = await readFile(opts.sharedPath, "utf8")
    state = JSON.parse(raw)
    for (const [k, exp] of Object.entries(state.seen || {})) {
      if (now > exp) delete state.seen[k]
    }
  } catch {
    // missing/corrupt file -> start fresh
  }
  state.seen ??= {}
  state.lastBySession ??= {}

  if (evtId && state.seen[evtId] && now < state.seen[evtId]) return false

  const lastForKey = state.lastBySession[sessionKey] || 0
  if (now - lastForKey < opts.sessionCooldown) return false
  if (now - (state.lastGlobal || 0) < opts.globalCooldown) return false

  if (evtId) state.seen[evtId] = now + opts.seenTTL
  state.lastBySession[sessionKey] = now
  state.lastGlobal = now

  // prune to cap file size
  const seenKeys = Object.keys(state.seen)
  if (seenKeys.length > 300) {
    const sorted = seenKeys.sort((a, b) => state.seen[b] - state.seen[a])
    const keep = new Set(sorted.slice(0, 200))
    for (const k of seenKeys) if (!keep.has(k)) delete state.seen[k]
  }
  const sessionKeys = Object.keys(state.lastBySession)
  if (sessionKeys.length > 200) {
    const cutoff = now - opts.sessionCooldown * 4
    for (const k of sessionKeys) if (state.lastBySession[k] < cutoff) delete state.lastBySession[k]
  }

  try {
    const tmp = opts.sharedPath + ".tmp." + process.pid
    await writeFile(tmp, JSON.stringify(state), "utf8")
    await rename(tmp, opts.sharedPath)
  } catch (e) {
    console.error("[termux-notify] shared state write failed:", e?.message)
  }
  return true
}

// ── notification ──────────────────────────────────────────────────────────

async function notify(title, content, nid, kind, opts) {
  const vibrate = kind === "error" ? opts.vibrateError : opts.vibrateIdle
  const baseArgs = [
    "--id",
    nid,
    "--title",
    title,
    "--content",
    content,
    "--priority",
    opts.priority,
    "--vibrate",
    vibrate,
  ]
  if (opts.sound) baseArgs.push("--sound")

  return new Promise((resolve, reject) => {
    const p = spawn(opts.bin, baseArgs, { stdio: "ignore" })
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`termux-notification exit ${code}`))))
  })
}

function isTermuxEnvironment() {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux"))
}

// ── plugin ─────────────────────────────────────────────────────────────────

export default define({
  id: "termux-notify",

  /**
   * @param {any} ctx  PluginContext (typed as any to stay compat across SDK versions)
   */
  setup: async (ctx) => {
    const userOpts = (ctx.options ?? {})
    const opts = { ...DEFAULTS, ...userOpts }

    if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) {
      opts.sharedPath = userOpts.sharedPath
    }

    const enabledKinds = new Set(
      Array.isArray(userOpts.kinds) && userOpts.kinds.length ? userOpts.kinds : ["idle", "error"]
    )

    if (opts.requireTermux && !isTermuxEnvironment()) {
      console.warn(
        "[termux-notify] Not in Termux (TERMUX_VERSION/PREFIX missing) — plugin will still listen but notifications may fail. Set { requireTermux:false } to silence this."
      )
    }

    if (!ctx?.event?.subscribe) {
      console.error("[termux-notify] ctx.event.subscribe not available — check OpenCode version >= 1.18")
      return () => {}
    }

    const controller = new AbortController()
    const events = ctx.event.subscribe({ signal: controller.signal })

    void (async () => {
      try {
        for await (const event of events) {
          if (!event?.type) continue

          let kind = null
          if (
            event.type === "session.idle" ||
            event.type === "session.execution.succeeded" ||
            (event.type === "session.status" && event.status?.type === "idle")
          ) {
            kind = "idle"
          } else if (
            event.type === "session.error" ||
            event.type === "session.execution.failed" ||
            event.type === "session.step.failed"
          ) {
            kind = "error"
          } else {
            continue
          }

          if (!enabledKinds.has(kind)) continue

          const evtId =
            event.id ||
            event.eventID ||
            `${event.type}:${event.data?.sessionID || event.properties?.sessionID || ""}:${event.created || ""}`
          const sessionID = event.data?.sessionID || event.properties?.sessionID || event.sessionID || "global"
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
          } catch {
            // session lookup is best-effort
          }

          const titleIdle = typeof userOpts.titleIdle === "string" ? userOpts.titleIdle : `OpenCode — ${sessionName}`
          const titleError = typeof userOpts.titleError === "string" ? userOpts.titleError : `OpenCode ⚠️ — ${sessionName}`
          const contentIdle = typeof userOpts.contentIdle === "string" ? userOpts.contentIdle : "Session finished ✅"
          const contentError = typeof userOpts.contentError === "string" ? userOpts.contentError : "Session errored — go check it"

          try {
            if (kind === "idle") {
              await notify(titleIdle, contentIdle, nid, "idle", opts)
            } else {
              await notify(titleError, contentError, nid, "error", opts)
            }
          } catch (err) {
            console.error(`[termux-notify] Failed to send ${kind} notification:`, err?.message || err)
          }
        }
      } catch (e) {
        if (e?.name !== "AbortError") console.error("[termux-notify] event loop error:", e)
      }
    })()

    return () => controller.abort()
  },
})
