import { spawn } from "node:child_process"
import { VIBRATE_PATTERNS, PRIORITY_BY_KIND } from "./constants.js"
import { playAudio } from "./audio.js"
import type { ResolvedOpts } from "./types.js"

export async function notify(title: string, content: string, nid: string, soundName: string, opts: ResolvedOpts): Promise<void> {
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
