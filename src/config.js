import { DEFAULTS } from "./constants.js"

export function resolveOpts(userOpts) {
  const opts = { ...DEFAULTS, ...userOpts }
  if (typeof userOpts.sharedPath === "string" && userOpts.sharedPath.trim()) opts.sharedPath = userOpts.sharedPath
  if (typeof userOpts.bin === "string" && userOpts.bin.trim()) opts.bin = userOpts.bin
  if (typeof userOpts.mediaBin === "string" && userOpts.mediaBin.trim()) opts.mediaBin = userOpts.mediaBin
  return opts
}

export function getEnabledKinds(userOpts) {
  const enabledKinds = new Set(
    Array.isArray(userOpts.kinds) && userOpts.kinds.length
      ? userOpts.kinds
      : ["default", "question", "permission", "error", "done", "subagent_done"],
  )
  if (enabledKinds.has("idle")) {
    enabledKinds.delete("idle")
    enabledKinds.add("done")
    enabledKinds.add("default")
  }
  return enabledKinds
}

export function getTitle(kind, sessionName, userOpts) {
  const titles = {
    default: `OpenCode — ${sessionName}`,
    done: `OpenCode — ${sessionName}`,
    subagent_done: `OpenCode (subagent) — ${sessionName}`,
    question: `OpenCode ❓ — ${sessionName}`,
    permission: `OpenCode 🔐 — ${sessionName}`,
    error: `OpenCode ⚠️ — ${sessionName}`,
  }
  return typeof userOpts[`title_${kind}`] === "string" ? userOpts[`title_${kind}`] : titles[kind] || titles.default
}

export function getContent(kind, userOpts) {
  const contents = {
    default: "Session finished ✅",
    done: "Session done ✅",
    subagent_done: "Subagent done ✅",
    question: "Question needs input — go answer it",
    permission: "Permission needs input — go approve it",
    error: "Session errored — go check it",
  }
  return typeof userOpts[`content_${kind}`] === "string" ? userOpts[`content_${kind}`] : contents[kind] || contents.default
}
