import { readFile, writeFile, rename } from "node:fs/promises"

export async function shouldNotifyShared(evtId, sessionKey, opts) {
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
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[termux-notify] shared state write failed:", msg)
  }
  return true
}
