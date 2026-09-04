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

import { readFile, writeFile, rename } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { define } from "@opencode-ai/plugin/v2/promise"

// ── sound map (matches packages/tui/src/attention.ts) ─────────────────────

const SOUND_FILES = {
  default: "bip-bop-01.mp3",
  question: "bip-bop-03.mp3",
  permission: "staplebops-06.mp3",
  error: "nope-03.mp3",
  done: "bip-bop-01.mp3",
  subagent_done: "yup-01.mp3",
}

const VIBRATE_PATTERNS = {
  default: "400,200,400",
  done: "400,200,400",
  subagent_done: "200,100,200",
  question: "500,250,500",
  permission: "600,200,600",
  error: "800,300,800,300,800",
}

const PRIORITY_BY_KIND = {
  default: "high",
  done: "high",
  subagent_done: "default",
  question: "high",
  permission: "high",
  error: "high",
}

// ── defaults ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  bin: "/data/data/com.termux/files/usr/bin/termux-notification",
  mediaBin: "/data/data/com.termux/files/usr/bin/termux-media-player",
  sharedPath: join(tmpdir(), "termux-notify-shared.json"),
  seenTTL: 60_000,
  sessionCooldown: 5_000,
  globalCooldown: 1_000,
  sound: true, // termux-notification --sound boolean + play mp3 via media player
  playSound: true, // play bundled mp3 via termux-media-player
  vibrate: true,
  requireTermux: true,
  priority: undefined, // override per-kind if set
}

// ── audio path resolution ─────────────────────────────────────────────────

function resolveAudioPath(file) {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const candidates = [
      join(here, "../assets/audio", file),
      join(here, "assets/audio", file),
      join(here, "../../assets/audio", file),
      join(here, "../src/assets/audio", file),
      join(process.cwd(), "assets/audio", file),
      join(process.cwd(), "src/assets/audio", file),
    ]
    for (const p of candidates) if (existsSync(p)) return p
    return candidates[0]
  } catch {
    return file
  }
}

async function playAudio(soundName, opts) {
  if (!opts.playSound) return
  const file = SOUND_FILES[soundName]
  if (!file) return
  const path = resolveAudioPath(file)
  if (!existsSync(path)) {
    console.warn(`[termux-notify] audio file not found: ${path} for ${soundName}`)
    return
  }
  const bin = existsSync(opts.mediaBin) ? opts.mediaBin : "termux-media-player"
  return new Promise((resolve) => {
    const p = spawn(bin, ["play", path], { stdio: "ignore" })
    p.on("error", (err) => {
      console.error(`[termux-notify] media play failed for ${soundName}:`, err.message)
      resolve()
    })
    p.on("close", () => resolve())
    // don't block — fire and forget, but resolve when done
    setTimeout(() => {
      try { p.unref?.() } catch {}
      resolve()
    }, 3000)
  })
}

// ── shared dedup ──────────────────────────────────────────────────────────

async function shouldNotifyShared(evtId, sessionKey, opts) {
  const now = Date.now()
  let state = { seen: {}, lastBySession: {}, lastGlobal: 0 }
  try {
    const raw = await readFile(opts.sharedPath, "utf8")
    state = JSON.parse(raw)
    for (const [k, exp] of Object.entries(state.seen || {})) {
      if (now > exp) delete state.seen[k]
    }
  } catch {}
  state.seen ??= {}
  state.lastBySession ??= {}

  if (evtId && state.seen[evtId] && now < state.seen[evtId]) return false

  const lastForKey = state.lastBySession[sessionKey] || 0
  if (now - lastForKey < opts.sessionCooldown) return false
  if (now - (state.lastGlobal || 0) < opts.globalCooldown) return false

  if (evtId) state.seen[evtId] = now + opts.seenTTL
  state.lastBySession[sessionKey] = now
  state.lastGlobal = now

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

async function notify(title, content, nid, soundName, opts) {
  const vibrate = opts.vibrate ? (VIBRATE_PATTERNS[soundName] || VIBRATE_PATTERNS.default) : undefined
  const priority = opts.priority || PRIORITY_BY_KIND[soundName] || "high"
  const baseArgs = ["--id", nid, "--title", title, "--content", content, "--priority", priority]
  if (vibrate) baseArgs.push("--vibrate", vibrate)

  const notifPromise = new Promise((resolve, reject) => {
    const p = spawn(opts.bin, baseArgs, { stdio: "ignore" })
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`termux-notification exit ${code}`))))
  })

  const audioPromise = playAudio(soundName, opts)

  try {
    await notifPromise
  } catch (err) {
    throw err
  } finally {
    // fire audio in parallel, don't block notification
    void audioPromise.catch(() => {})
  }
}

function isTermuxEnvironment() {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux"))
}

// ── event classification ──────────────────────────────────────────────────

async function classifyEvent(event, ctx) {
  const t = event?.type
  if (!t) return null

  const sessionID = event.properties?.sessionID || event.data?.sessionID || event.sessionID || event.properties?.id || "global"
  const evtId = event.id || event.eventID || `${t}:${sessionID}:${event.created || ""}:${event.properties?.id || event.properties?.requestID || ""}`

  // question
  if (t === "question.asked" || t === "question.v2.asked" || t === "question.updated" || t.startsWith("question")) {
    return { kind: "question", sound: "question", sessionID, evtId, isSubagent: false }
  }
  // permission
  if (t === "permission.asked" || t === "permission.v2.asked" || t.startsWith("permission")) {
    return { kind: "permission", sound: "permission", sessionID, evtId, isSubagent: false }
  }
  // error
  if (
    t === "session.error" ||
    t === "session.execution.failed" ||
    t === "session.step.failed" ||
    t === "error" ||
    t.endsWith(".error")
  ) {
    return { kind: "error", sound: "error", sessionID, evtId, isSubagent: false }
  }
  // session.status idle -> done / subagent_done
  if (t === "session.status" && event.properties?.status?.type === "idle") {
    let isSubagent = false
    try {
      if (ctx?.session?.get) {
        const info = await ctx.session.get({ sessionID })
        const raw = info?.info || info?.data || info
        isSubagent = Boolean(raw?.parentID || raw?.parentId || raw?.parent)
      }
    } catch {}
    // check event payload for parentID too
    if (!isSubagent && event.properties?.parentID) isSubagent = true
    const sound = isSubagent ? "subagent_done" : "done"
    const kind = isSubagent ? "subagent_done" : "done"
    return { kind, sound, sessionID, evtId, isSubagent }
  }
  // legacy session.idle / execution.succeeded
  if (t === "session.idle" || t === "session.execution.succeeded") {
    let isSubagent = false
    try {
      if (ctx?.session?.get) {
        const info = await ctx.session.get({ sessionID })
        const raw = info?.info || info?.data || info
        isSubagent = Boolean(raw?.parentID || raw?.parentId)
      }
    } catch {}
    const sound = isSubagent ? "subagent_done" : "done"
    const kind = isSubagent ? "subagent_done" : "done"
    return { kind, sound, sessionID, evtId, isSubagent }
  }

  return null
}

// ── plugin ─────────────────────────────────────────────────────────────────

export default define({
  id: "termux-notify",
  setup: async (ctx) => {
    const userOpts = (ctx.options ?? {})
    const opts = { ...DEFAULTS, ...userOpts }
    if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) opts.sharedPath = userOpts.sharedPath
    if (typeof userOpts.bin === "string" && userOpts.bin.trim()) opts.bin = userOpts.bin
    if (typeof userOpts.mediaBin === "string" && userOpts.mediaBin.trim()) opts.mediaBin = userOpts.mediaBin

    const enabledKinds = new Set(
      Array.isArray(userOpts.kinds) && userOpts.kinds.length
        ? userOpts.kinds
        : ["default", "question", "permission", "error", "done", "subagent_done"]
    )

    // legacy: if user passed ["idle","error"], map idle -> done/default
    if (enabledKinds.has("idle")) {
      enabledKinds.delete("idle")
      enabledKinds.add("done")
      enabledKinds.add("default")
    }

    if (opts.requireTermux && !isTermuxEnvironment()) {
      console.warn("[termux-notify] Not in Termux (TERMUX_VERSION/PREFIX missing) — plugin will still listen but notifications may fail. Set { requireTermux:false } to silence this.")
    }

    if (!ctx?.event?.subscribe) {
      console.error("[termux-notify] ctx.event.subscribe not available — check OpenCode version >= 1.18")
      return () => {}
    }

    const controller = new AbortController()
    const events = ctx.event.subscribe({ signal: controller.signal })

    // track active sessions like TUI does to avoid spurious done
    const active = new Set()
    const errored = new Set()

    void (async () => {
      try {
        for await (const event of events) {
          if (!event?.type) continue

          // maintain active/errored tracking for session.status
          if (event.type === "session.status") {
            const sid = event.properties?.sessionID
            if (!sid) continue
            const st = event.properties?.status?.type
            if (st === "busy" || st === "retry") {
              active.add(sid)
              errored.delete(sid)
              continue // not a done yet
            }
            if (st !== "idle") continue
            if (!active.has(sid)) continue // was not active → spurious
            active.delete(sid)
            if (errored.has(sid)) {
              errored.delete(sid)
              continue // was errored, session.error already notified
            }
            // fall through to classify as done
          }
          if (event.type === "session.error") {
            const sid = event.properties?.sessionID
            if (sid && active.has(sid)) errored.add(sid)
          }

          const classified = await classifyEvent(event, ctx)
          if (!classified) continue

          const { kind, sound, sessionID } = classified
          if (!enabledKinds.has(kind) && !enabledKinds.has(sound)) continue

          // also allow "default" to match any done if user only enabled default
          // (they share same file)
          const effectiveKind = kind

          const evtId = classified.evtId
          const sessionKey = `${sessionID}:${effectiveKind}`

          const ok = await shouldNotifyShared(evtId, sessionKey, opts)
          if (!ok) continue

          const nid = `opencode-${sessionID}-${effectiveKind}`

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

          // titles per kind
          const titles = {
            default: `OpenCode — ${sessionName}`,
            done: `OpenCode — ${sessionName}`,
            subagent_done: `OpenCode (subagent) — ${sessionName}`,
            question: `OpenCode ❓ — ${sessionName}`,
            permission: `OpenCode 🔐 — ${sessionName}`,
            error: `OpenCode ⚠️ — ${sessionName}`,
          }
          const contents = {
            default: "Session finished ✅",
            done: "Session done ✅",
            subagent_done: "Subagent done ✅",
            question: "Question needs input — go answer it",
            permission: "Permission needs input — go approve it",
            error: "Session errored — go check it",
          }

          const title = typeof userOpts[`title_${kind}`] === "string" ? userOpts[`title_${kind}`] : titles[kind] || titles.default
          const content = typeof userOpts[`content_${kind}`] === "string" ? userOpts[`content_${kind}`] : contents[kind] || contents.default

          // respect subagent config: by default play sound but suppress notification for subagent? mirror TUI
          const notifySubagents = userOpts.notifySubagents !== false // default true for Termux (useful), but allow false to mirror TUI
          if (kind === "subagent_done" && !notifySubagents) {
            // only play sound, no termux-notification
            await playAudio(sound, opts)
            continue
          }

          try {
            await notify(title, content, nid, sound, opts)
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
