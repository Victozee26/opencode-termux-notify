import { tmpdir } from "node:os"
import { join } from "node:path"

export const SOUND_FILES: Record<string, string> = {
  default: "bip-bop-01.mp3",
  question: "bip-bop-03.mp3",
  permission: "staplebops-06.mp3",
  error: "nope-03.mp3",
  done: "bip-bop-01.mp3",
  subagent_done: "yup-01.mp3",
}

export const VIBRATE_PATTERNS: Record<string, string> = {
  default: "400,200,400",
  done: "400,200,400",
  subagent_done: "200,100,200",
  question: "500,250,500",
  permission: "600,200,600",
  error: "800,300,800,300,800",
}

export const PRIORITY_BY_KIND: Record<string, string> = {
  default: "high",
  done: "high",
  subagent_done: "default",
  question: "high",
  permission: "high",
  error: "high",
}

export const DEFAULTS = {
  bin: "/data/data/com.termux/files/usr/bin/termux-notification",
  mediaBin: "/data/data/com.termux/files/usr/bin/termux-media-player",
  sharedPath: join(tmpdir(), "termux-notify-shared.json"),
  seenTTL: 60_000,
  sessionCooldown: 5_000,
  globalCooldown: 1_000,
  sound: true,
  playSound: true,
  vibrate: true,
  requireTermux: true,
  priority: undefined as string | undefined,
}
