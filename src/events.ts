import type { NotifyKind } from "./types.js"

export async function classifyEvent(
  event: any,
  ctx: any,
): Promise<{ kind: NotifyKind; sound: string; sessionID: string; evtId: string; isSubagent: boolean } | null> {
  const t: string | undefined = event?.type
  if (!t) return null

  const sessionID: string = event.properties?.sessionID || event.data?.sessionID || event.sessionID || event.properties?.id || "global"
  const evtId: string =
    event.id || event.eventID || `${t}:${sessionID}:${event.created || ""}:${event.properties?.id || event.properties?.requestID || ""}`

  if (t === "question.asked" || t === "question.v2.asked" || t === "question.updated" || t.startsWith("question")) {
    return { kind: "question", sound: "question", sessionID, evtId, isSubagent: false }
  }
  if (t === "permission.asked" || t === "permission.v2.asked" || t.startsWith("permission")) {
    return { kind: "permission", sound: "permission", sessionID, evtId, isSubagent: false }
  }
  if (
    t === "session.error" ||
    t === "session.execution.failed" ||
    t === "session.step.failed" ||
    t === "error" ||
    t.endsWith(".error")
  ) {
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
