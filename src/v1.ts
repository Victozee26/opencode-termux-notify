/**
 * opencode-termux-notify — Termux-native notifications for OpenCode (V1)
 *
 * V1 plugin API: export const TermuxNotify: Plugin = async (input, options) => ({ event })
 * Loaded via `plugin: ["opencode-termux-notify"]` or `["opencode-termux-notify/v1"]`
 * V2 is available at `opencode-termux-notify/v2`
 *
 * 6 builtin attention sounds:
 *   default       → bip-bop-01.mp3
 *   question      → bip-bop-03.mp3
 *   permission    → staplebops-06.mp3
 *   error         → nope-03.mp3
 *   done          → bip-bop-01.mp3
 *   subagent_done → yup-01.mp3
 */

import type { Plugin } from "@opencode-ai/plugin"
import { playAudio } from "./audio.js"
import { getEnabledKinds, getContent, getTitle, resolveOpts } from "./config.js"
import { shouldNotifyShared } from "./dedup.js"
import { isTermuxEnvironment } from "./env.js"
import { classifyEvent } from "./events.js"
import { notify } from "./notify.js"
import type { TermuxNotifyOptions } from "./types.js"

export type { TermuxNotifyOptions } from "./types.js"
export { DEFAULTS, PRIORITY_BY_KIND, SOUND_FILES, VIBRATE_PATTERNS } from "./constants.js"

export const TermuxNotify: Plugin = async (input, options) => {
  const userOpts: TermuxNotifyOptions = (options ?? {}) as TermuxNotifyOptions
  const opts = resolveOpts(userOpts)
  const enabledKinds = getEnabledKinds(userOpts)

  if (opts.requireTermux && !isTermuxEnvironment()) {
    console.warn(
      "[termux-notify] Not in Termux (TERMUX_VERSION/PREFIX missing) — plugin will still listen but notifications may fail. Set { requireTermux:false } to silence this.",
    )
  }

  const active = new Set<string>()
  const errored = new Set<string>()

  // Adapter so classifyEvent and session-title logic can use V2-style ctx.session.get
  // V1 client uses client.session.get({ path: { id } }) -> { data: Session }
  const ctxAdapter: any = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        try {
          const client: any = (input as any).client
          if (!client?.session?.get) return undefined
          let raw: any
          // try V2-style first, then V1-style
          try {
            raw = await client.session.get({ sessionID })
            if (raw && (raw.info || raw.data || raw.title || raw.id)) return raw
          } catch {}
          try {
            raw = await client.session.get({ path: { id: sessionID } })
          } catch {}
          // SDK gen returns { data, ... } or direct
          const data = raw?.data ?? raw
          return data
        } catch {
          return undefined
        }
      },
    },
  }

  return {
    event: async ({ event }: { event: any }) => {
      if (!event?.type) return

      // replicate V2 status tracking to avoid duplicate idle notifications after errors
      if (event.type === "session.status") {
        const sid: string | undefined = event.properties?.sessionID
        if (!sid) return
        const st: string | undefined = event.properties?.status?.type
        if (st === "busy" || st === "retry") {
          active.add(sid)
          errored.delete(sid)
          return
        }
        if (st !== "idle") return
        if (!active.has(sid)) return
        active.delete(sid)
        if (errored.has(sid)) {
          errored.delete(sid)
          return
        }
      }
      if (event.type === "session.error") {
        const sid: string | undefined = event.properties?.sessionID
        if (sid && active.has(sid)) errored.add(sid)
      }

      const classified = await classifyEvent(event, ctxAdapter)
      if (!classified) return

      const { kind, sound, sessionID } = classified
      if (!enabledKinds.has(kind) && !enabledKinds.has(sound)) return

      const evtId: string = classified.evtId
      const sessionKey = `${sessionID}:${kind}`

      const ok = await shouldNotifyShared(evtId, sessionKey, opts)
      if (!ok) return

      const nid = `opencode-${sessionID}-${kind}`

      let sessionName = sessionID.slice(0, 8)
      try {
        const info: any = await ctxAdapter.session.get({ sessionID })
        const raw = info?.info || info?.data || info
        const candidate: string | undefined = raw?.title || raw?.slug || raw?.summary?.title || raw?.id
        if (candidate && typeof candidate === "string" && candidate.trim()) {
          sessionName = candidate.trim().slice(0, 40)
        }
      } catch {}

      const title = getTitle(kind, sessionName, userOpts)
      const content = getContent(kind, userOpts)

      const notifySubagents: boolean = (userOpts as any).notifySubagents !== false
      if (kind === "subagent_done" && !notifySubagents) {
        await playAudio(sound, opts)
        return
      }

      try {
        await notify(title, content, nid, sound, opts)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[termux-notify] Failed to send ${kind} notification:`, msg)
      }
    },
  }
}

export default TermuxNotify
