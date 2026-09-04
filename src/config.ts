import { DEFAULTS } from "./constants.js"
import type { ResolvedOpts, TermuxNotifyOptions } from "./types.js"

export function resolveOpts(userOpts: TermuxNotifyOptions): ResolvedOpts {
  const opts: ResolvedOpts = { ...DEFAULTS, ...userOpts } as ResolvedOpts
  if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) opts.sharedPath = userOpts.sharedPath
  if (typeof (userOpts as any).bin === "string" && (userOpts as any).bin.trim()) opts.bin = (userOpts as any).bin
  if (typeof userOpts.mediaBin === "string" && userOpts.mediaBin.trim()) opts.mediaBin = userOpts.mediaBin
  return opts
}

export function getEnabledKinds(userOpts: TermuxNotifyOptions): Set<string> {
  const enabledKinds = new Set<string>(
    Array.isArray(userOpts.kinds) && userOpts.kinds.length
      ? (userOpts.kinds as string[])
      : ["default", "question", "permission", "error", "done", "subagent_done"],
  )
  if (enabledKinds.has("idle")) {
    enabledKinds.delete("idle")
    enabledKinds.add("done")
    enabledKinds.add("default")
  }
  return enabledKinds
}

export function getTitle(kind: string, sessionName: string, userOpts: TermuxNotifyOptions): string {
  const titles: Record<string, string> = {
    default: `OpenCode — ${sessionName}`,
    done: `OpenCode — ${sessionName}`,
    subagent_done: `OpenCode (subagent) — ${sessionName}`,
    question: `OpenCode ❓ — ${sessionName}`,
    permission: `OpenCode 🔐 — ${sessionName}`,
    error: `OpenCode ⚠️ — ${sessionName}`,
  }
  const key = `title_${kind}` as keyof TermuxNotifyOptions
  return typeof (userOpts as any)[key] === "string" ? (userOpts as any)[key] : titles[kind] || titles.default!
}

export function getContent(kind: string, userOpts: TermuxNotifyOptions): string {
  const contents: Record<string, string> = {
    default: "Session finished ✅",
    done: "Session done ✅",
    subagent_done: "Subagent done ✅",
    question: "Question needs input — go answer it",
    permission: "Permission needs input — go approve it",
    error: "Session errored — go check it",
  }
  const key = `content_${kind}` as keyof TermuxNotifyOptions
  return typeof (userOpts as any)[key] === "string" ? (userOpts as any)[key] : contents[kind] || contents.default!
}
