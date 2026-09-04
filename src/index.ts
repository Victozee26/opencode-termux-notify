/**
 * opencode-termux-notify — Termux-native notifications for OpenCode (V2)
 *
 * TypeScript source — shipped alongside `src/index.js` for consumers who
 * prefer importing the typed entrypoint. Build is optional: OpenCode loads
 * plugins from source (bun/tsx) and `src/index.js` is the runtime entrypoint.
 */

import { readFile, writeFile, rename } from "node:fs/promises"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
// `define` is the typed helper for OpenCode V2 plugins (promise API).
// Use subpath import — current @opencode-ai/plugin re-exports `define` from
// `v2/promise` / `v2/effect`, while the bare import only exposes `tool`.
import { define } from "@opencode-ai/plugin/v2/promise"

export interface TermuxNotifyOptions {
  /** Absolute path to termux-notification binary */
  bin?: string
  /** Cross-instance dedup file path */
  sharedPath?: string
  /** event.id TTL in ms (default 60_000) */
  seenTTL?: number
  /** Per-session cooldown in ms (default 5_000) */
  sessionCooldown?: number
  /** Global throttle in ms (default 1_000) */
  globalCooldown?: number
  /** Vibrate pattern for idle (comma ms list) */
  vibrateIdle?: string
  /** Vibrate pattern for error */
  vibrateError?: string
  /** termux-notification --priority */
  priority?: "high" | "low" | "default" | "max"
  /** Add --sound */
  sound?: boolean
  /** Warn/skip when not in Termux env (default true) */
  requireTermux?: boolean
  /** Which kinds to notify on (default ["idle","error"]) */
  kinds?: Array<"idle" | "error">
  /** Override titles/content */
  titleIdle?: string
  titleError?: string
  contentIdle?: string
  contentError?: string
}

const DEFAULTS = {
  bin: "/data/data/com.termux/files/usr/bin/termux-notification",
  sharedPath: join(tmpdir(), "termux-notify-shared.json"),
  seenTTL: 60_000,
  sessionCooldown: 5_000,
  globalCooldown: 1_000,
  vibrateIdle: "400,200,400",
  vibrateError: "800,300,800,300,800",
  priority: "high" as const,
  sound: true,
  requireTermux: true,
  kinds: ["idle", "error"] as Array<"idle" | "error">,
}

type NotifyKind = "idle" | "error"
type ResolvedOpts = typeof DEFAULTS

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
  } catch {
    // missing/corrupt -> fresh
  }
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

async function notify(title: string, content: string, nid: string, kind: NotifyKind, opts: ResolvedOpts): Promise<void> {
  const vibrate = kind === "error" ? opts.vibrateError : opts.vibrateIdle
  const baseArgs = ["--id", nid, "--title", title, "--content", content, "--priority", opts.priority, "--vibrate", vibrate]
  if (opts.sound) baseArgs.push("--sound")

  await new Promise<void>((resolve, reject) => {
    const p = spawn(opts.bin, baseArgs, { stdio: "ignore" })
    p.on("error", reject)
    p.on("close", (code: number | null) => (code === 0 ? resolve() : reject(new Error(`termux-notification exit ${code}`))))
  })
}

function isTermuxEnvironment(): boolean {
  return Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes("com.termux"))
}

export default define({
  id: "termux-notify",
  // `setup` may return a cleanup function at runtime — types at 1.18.27
  // declare `Promise<void>` so we cast via `any` to keep cleanup semantics
  // (mirrors the working global plugin at ~/.config/opencode/plugins/termux-notify).
  setup: async (ctx: any): Promise<any> => {
    const userOpts: TermuxNotifyOptions = (ctx.options ?? {}) as TermuxNotifyOptions
    const opts: ResolvedOpts = { ...DEFAULTS, ...userOpts } as ResolvedOpts
    if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) {
      opts.sharedPath = userOpts.sharedPath
    }
    const enabledKinds = new Set<NotifyKind>(
      Array.isArray(userOpts.kinds) && userOpts.kinds.length ? (userOpts.kinds as NotifyKind[]) : (["idle", "error"] as NotifyKind[])
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
    const events: AsyncIterable<any> = ctx.event.subscribe({ signal: controller.signal })

    void (async () => {
      try {
        for await (const event of events as AsyncIterable<any>) {
          if (!event?.type) continue

          let kind: NotifyKind | null = null
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

          const evtId: string =
            event.id ||
            event.eventID ||
            `${event.type}:${event.data?.sessionID || event.properties?.sessionID || ""}:${event.created || ""}`
          const sessionID: string = event.data?.sessionID || event.properties?.sessionID || event.sessionID || "global"
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
          } catch {
            // best-effort
          }

          const titleIdle = typeof userOpts.titleIdle === "string" ? userOpts.titleIdle : `OpenCode — ${sessionName}`
          const titleError = typeof userOpts.titleError === "string" ? userOpts.titleError : `OpenCode ⚠️ — ${sessionName}`
          const contentIdle = typeof userOpts.contentIdle === "string" ? userOpts.contentIdle : "Session finished ✅"
          const contentError = typeof userOpts.contentError === "string" ? userOpts.contentError : "Session errored — go check it"

          try {
            if (kind === "idle") await notify(titleIdle, contentIdle, nid, "idle", opts)
            else await notify(titleError, contentError, nid, "error", opts)
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
