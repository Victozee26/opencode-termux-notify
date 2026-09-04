import { existsSync } from "node:fs"
import { copyFile, mkdir, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { SOUND_FILES } from "./constants.js"
import type { ResolvedOpts } from "./types.js"

const TERMUX_USR_TMP = "/data/data/com.termux/files/usr/tmp"
const TERMUX_FILES_PREFIX = "/data/data/com.termux/files/"

export function getAccessibleDir(): string {
  const envTmp = process.env.TMPDIR
  if (envTmp && envTmp.startsWith(TERMUX_FILES_PREFIX) && existsSync(envTmp)) {
    return join(envTmp, "termux-notify-audio")
  }
  if (existsSync(TERMUX_USR_TMP)) {
    return join(TERMUX_USR_TMP, "termux-notify-audio")
  }
  return join(tmpdir(), "termux-notify-audio")
}

export async function ensureAccessibleAudio(source: string, file: string): Promise<string> {
  if (source.startsWith(TERMUX_FILES_PREFIX)) return source
  const dir = getAccessibleDir()
  try {
    await mkdir(dir, { recursive: true })
    const dest = join(dir, file)
    if (!existsSync(dest)) {
      await copyFile(source, dest)
      try {
        await chmod(dest, 0o644)
      } catch {}
    }
    return dest
  } catch {
    return source
  }
}

export function resolveAudioPath(file: string): string {
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

export async function playAudio(soundName: string, opts: ResolvedOpts): Promise<void> {
  if (!opts.playSound) return
  const file = SOUND_FILES[soundName]
  if (!file) return
  const source = resolveAudioPath(file)
  if (!existsSync(source)) {
    console.warn(`[termux-notify] audio file not found: ${source} for ${soundName}`)
    return
  }
  const path = await ensureAccessibleAudio(source, file)
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
