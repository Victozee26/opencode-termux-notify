/**
 * opencode-termux-notify — Termux-native notifications for OpenCode (V2)
 *
 * 6 builtin attention sounds:
 *   default       → bip-bop-01.mp3
 *   question      → bip-bop-03.mp3
 *   permission    → staplebops-06.mp3
 *   error         → nope-03.mp3
 *   done          → bip-bop-01.mp3
 *   subagent_done → yup-01.mp3
 *
 * Audio bundled at assets/audio/*.mp3, played via `termux-media-player play <file>`
 * (termux-notification --sound is boolean only — no file arg)
 */

import { readFile, writeFile, rename } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { define } from "@opencode-ai/plugin/v2/promise"

export interface TermuxNotifyOptions {
  bin?: string
  mediaBin?: string
  sharedPath?: string
  seenTTL?: number
  sessionCooldown?: number
  globalCooldown?: number
  sound?: boolean
  playSound?: boolean
  vibrate?: boolean
  requireTermux?: boolean
  priority?: string
  kinds?: Array<"default" | "question" | "permission" | "error" | "done" | "subagent_done" | "idle">
  notifySubagents?: boolean
  title_default?: string
  title_done?: string
  title_subagent_done?: string
  title_question?: string
  title_permission?: string
  title_error?: string
  content_default?: string
  content_done?: string
  content_subagent_done?: string
  content_question?: string
  content_permission?: string
  content_error?: string
  // legacy
  vibrateIdle?: string
  vibrateError?: string
  titleIdle?: string
  titleError?: string
  contentIdle?: string
  contentError?: string
}

const SOUND_FILES: Record<string, string> = {
  default: "bip-bop-01.mp3",
  question: "bip-bop-03.mp3",
  permission: "staplebops-06.mp3",
  error: "nope-03.mp3",
  done: "bip-bop-01.mp3",
  subagent_done: "yup-01.mp3",
}

const VIBRATE_PATTERNS: Record<string, string> = {
  default: "400,200,400",
  done: "400,200,400",
  subagent_done: "200,100,200",
  question: "500,250,500",
  permission: "600,200,600",
  error: "800,300,800,300,800",
}

const PRIORITY_BY_KIND: Record<string, string> = {
  default: "high",
  done: "high",
  subagent_done: "default",
  question: "high",
  permission: "high",
  error: "high",
}

const DEFAULTS = {
  bin: "/data/data/com.termux/files/usr/bin/termux-notification",
  mediaBin: "/data/data/com.termux/files/usr/bin/termux-media-player",
  sharedPath: join(tmpdir(), "termux-notify-shared.json"),
  seenTTL: 60_000,
  sessionCooldown: 5_000,
  globalCooldown: 1_000,
  sound: true,
  playSound: true,
  vibrate: true,
  requireTermux: true,
  priority: undefined as string | undefined,
}

type NotifyKind = "default" | "question" | "permission" | "error" | "done" | "subagent_done"
type ResolvedOpts = typeof DEFAULTS

function resolveAudioPath(file: string): string {
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
    return candidates[0]!
  } catch {
    return file
  }
}

async function playAudio(soundName: string, opts: ResolvedOpts): Promise<void> {
  if (!opts.playSound) return
  const file = SOUND_FILES[soundName]
  if (!file) return
  const path = resolveAudioPath(file)
  if (!existsSync(path)) {
    console.warn(`[termux-notify] audio file not found: ${path} for ${soundName}`)
    return
  }
  const bin = existsSync(opts.mediaBin) ? opts.mediaBin : "termux-media-player"
  await new Promise<void>((resolve) => {
    const p = spawn(bin, ["play", path], { stdio: "ignore" })
    p.on("error", (err) => {
      console.error(`[termux-notify] media play failed for ${soundName}:`, (err as Error).message)
      resolve()
    })
    p.on("close", () => resolve())
    setTimeout(() => {
      try {
        ;(p as any).unref?.()
      } catch {}
      resolve()
    }, 3000)
  })
}

async function shouldNotifyShared(evtId: string, sessionKey: string, opts: ResolvedOpts): Promise<boolean> {
  const now = Date.now()
  let state: { seen: Record<string, number>; lastBySession: Record<string, number>; lastGlobal: number } = {
    seen: {},
    lastBySession: {},
    lastGlobal: 0,
  }
  try {
    const raw = await readFile(opts.sharedPath, "utf8")
    state = JSON.parse(raw)
    for (const [k, exp] of Object.entries(state.seen || {})) {
      if (now > exp) delete state.seen[k]
    }
  } catch {}
  state.seen ??= {}
  state.lastBySession ??= {}

  if (evtId && state.seen[evtId] && now < (state.seen[evtId] as number)) return false

  const lastForKey: number = state.lastBySession[sessionKey] || 0
  if (now - lastForKey < opts.sessionCooldown) return false
  if (now - (state.lastGlobal || 0) < opts.globalCooldown) return false

  if (evtId) state.seen[evtId] = now + opts.seenTTL
  state.lastBySession[sessionKey] = now
  state.lastGlobal = now

  const seenKeys = Object.keys(state.seen)
  if (seenKeys.length > 300) {
    const sorted = seenKeys.sort((a, b) => (state.seen[b] as number) - (state.seen[a] as number))
    const keep = new Set(sorted.slice(0, 200))
    for (const k of seenKeys) if (!keep.has(k)) delete state.seen[k]
  }
  const sessionKeys = Object.keys(state.lastBySession)
  if (sessionKeys.length > 200) {
    const cutoff = now - opts.sessionCooldown * 4
    for (const k of sessionKeys) if ((state.lastBySession[k] as number) < cutoff) delete state.lastBySession[k]
  }

  try {
    const tmp = opts.sharedPath + ".tmp." + process.pid
    await writeFile(tmp, JSON.stringify(state), "utf8")
    await rename(tmp, opts.sharedPath)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[termux-notify] shared state write failed:", msg)
  }
  return true
}

async function notify(title: string, content: string, nid: string, soundName: string, opts: ResolvedOpts): Promise<void> {
  const vibrate = opts.vibrate ? VIBRATE_PATTERNS[soundName] || VIBRATE_PATTERNS.default : undefined
  const priority = opts.priority || PRIORITY_BY_KIND[soundName] || "high"
  const baseArgs = ["--id", nid, "--title", title, "--content", content, "--priority", priority]
  if (vibrate) baseArgs.push("--vibrate", vibrate)

  const notifPromise = new Promise<void>((resolve, reject) => {
    const p = spawn(opts.bin, baseArgs, { stdio: "ignore" })
    p.on("error", reject)
    p.on("close", (code: number | null) => (code === 0 ? resolve() : reject(new Error(`termux-notification exit ${code}`))))
  })

  const audioPromise = playAudio(soundName, opts)

  try {
    await notifPromise
  } finally {
    void audioPromise.catch(() => {})
  }
}

function isTermuxEnvironment(): boolean {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux"))
}

async function classifyEvent(
  event: any,
  ctx: any
): Promise<{ kind: NotifyKind; sound: string; sessionID: string; evtId: string; isSubagent: boolean } | null> {
  const t: string | undefined = event?.type
  if (!t) return null

  const sessionID: string = event.properties?.sessionID || event.data?.sessionID || event.sessionID || event.properties?.id || "global"
  const evtId: string =
    event.id || event.eventID || `${t}:${sessionID}:${event.created || ""}:${event.properties?.id || event.properties?.requestID || ""}`

  if (t === "question.asked" || t === "question.v2.asked" || t.startsWith("question")) {
    return { kind: "question", sound: "question", sessionID, evtId, isSubagent: false }
  }
  if (t === "permission.asked" || t === "permission.v2.asked" || t.startsWith("permission")) {
    return { kind: "permission", sound: "permission", sessionID, evtId, isSubagent: false }
  }
  if (t === "session.error" || t === "session.execution.failed" || t === "session.step.failed" || t.endsWith(".error")) {
    return { kind: "error", sound: "error", sessionID, evtId, isSubagent: false }
  }
  if (t === "session.status" && event.properties?.status?.type === "idle") {
    let isSubagent = false
    try {
      if (ctx?.session?.get) {
        const info: any = await ctx.session.get({ sessionID })
        const raw = info?.info || info?.data || info
        isSubagent = Boolean(raw?.parentID || raw?.parentId || raw?.parent)
      }
    } catch {}
    if (!isSubagent && event.properties?.parentID) isSubagent = true
    const sound = isSubagent ? "subagent_done" : "done"
    const kind: NotifyKind = isSubagent ? "subagent_done" : "done"
    return { kind, sound, sessionID, evtId, isSubagent }
  }
  if (t === "session.idle" || t === "session.execution.succeeded") {
    let isSubagent = false
    try {
      if (ctx?.session?.get) {
        const info: any = await ctx.session.get({ sessionID })
        const raw = info?.info || info?.data || info
        isSubagent = Boolean(raw?.parentID || raw?.parentId)
      }
    } catch {}
    const sound = isSubagent ? "subagent_done" : "done"
    const kind: NotifyKind = isSubagent ? "subagent_done" : "done"
    return { kind, sound, sessionID, evtId, isSubagent }
  }

  return null
}

export default define({
  id: "termux-notify",
  setup: async (ctx: any): Promise<any> => {
    const userOpts: TermuxNotifyOptions = (ctx.options ?? {}) as TermuxNotifyOptions
    const opts: ResolvedOpts = { ...DEFAULTS, ...userOpts } as ResolvedOpts
    if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) opts.sharedPath = userOpts.sharedPath
    if (typeof (userOpts as any).bin === "string" && (userOpts as any).bin.trim()) opts.bin = (userOpts as any).bin
    if (typeof userOpts.mediaBin === "string" && userOpts.mediaBin.trim()) opts.mediaBin = userOpts.mediaBin

    const enabledKinds = new Set<string>(
      Array.isArray(userOpts.kinds) && userOpts.kinds.length
        ? (userOpts.kinds as string[])
        : ["default", "question", "permission", "error", "done", "subagent_done"]
    )
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
    const events: AsyncIterable<any> = ctx.event.subscribe({ signal: controller.signal })

    const active = new Set<string>()
    const errored = new Set<string>()

    void (async () => {
      try {
        for await (const event of events as AsyncIterable<any>) {
          if (!event?.type) continue

          if (event.type === "session.status") {
            const sid: string | undefined = event.properties?.sessionID
            if (!sid) continue
            const st: string | undefined = event.properties?.status?.type
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
            const sid: string | undefined = event.properties?.sessionID
            if (sid && active.has(sid)) errored.add(sid)
          }

          const classified = await classifyEvent(event, ctx)
          if (!classified) continue

          const { kind, sound, sessionID } = classified
          if (!enabledKinds.has(kind) && !enabledKinds.has(sound)) continue

          const evtId: string = classified.evtId
          const sessionKey = `${sessionID}:${kind}`

          const ok = await shouldNotifyShared(evtId, sessionKey, opts)
          if (!ok) continue

          const nid = `opencode-${sessionID}-${kind}`

          let sessionName = sessionID.slice(0, 8)
          try {
            if (ctx?.session?.get) {
              const info: any = await ctx.session.get({ sessionID })
              const raw = info?.info || info?.data || info
              const candidate: string | undefined = raw?.title || raw?.slug || raw?.summary?.title || raw?.id
              if (candidate && typeof candidate === "string" && candidate.trim()) {
                sessionName = candidate.trim().slice(0, 40)
              }
            }
          } catch {}

          const titles: Record<string, string> = {
            default: `OpenCode — ${sessionName}`,
            done: `OpenCode — ${sessionName}`,
            subagent_done: `OpenCode (subagent) — ${sessionName}`,
            question: `OpenCode ❓ — ${sessionName}`,
            permission: `OpenCode 🔐 — ${sessionName}`,
            error: `OpenCode ⚠️ — ${sessionName}`,
          }
          const contents: Record<string, string> = {
            default: "Session finished ✅",
            done: "Session done ✅",
            subagent_done: "Subagent done ✅",
            question: "Question needs input — go answer it",
            permission: "Permission needs input — go approve it",
            error: "Session errored — go check it",
          }

          const title = typeof (userOpts as any)[`title_${kind}`] === "string" ? (userOpts as any)[`title_${kind}`] : titles[kind] || titles.default!
          const content = typeof (userOpts as any)[`content_${kind}`] === "string" ? (userOpts as any)[`content_${kind}`] : contents[kind] || contents.default!

          const notifySubagents: boolean = (userOpts as any).notifySubagents !== false
          if (kind === "subagent_done" && !notifySubagents) {
            await playAudio(sound, opts)
            continue
          }

          try {
            await notify(title, content, nid, sound, opts)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[termux-notify] Failed to send ${kind} notification:`, msg)
          }
        }
      } catch (e: unknown) {
        const err = e as Error & { name?: string }
        if (err?.name !== "AbortError") console.error("[termux-notify] event loop error:", e)
      }
    })()

    return () => controller.abort()
  },
})
