import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { SOUND_FILES } from "./constants.js"

export function resolveAudioPath(file) {
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

export async function playAudio(soundName, opts) {
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
    setTimeout(() => {
      try { p.unref?.() } catch {}
      resolve()
    }, 3000)
  })
}
