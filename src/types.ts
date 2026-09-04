import type { DEFAULTS } from "./constants.js"

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
  priority?: "high" | "low" | "default" | "max" | (string & {})
  kinds?: Array<"default" | "question" | "permission" | "error" | "done" | "subagent_done">
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
}

export type NotifyKind = "default" | "question" | "permission" | "error" | "done" | "subagent_done"
export type ResolvedOpts = typeof DEFAULTS
