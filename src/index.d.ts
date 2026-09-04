import type { Plugin } from "@opencode-ai/plugin";

export interface TermuxNotifyOptions {
  bin?: string;
  sharedPath?: string;
  seenTTL?: number;
  sessionCooldown?: number;
  globalCooldown?: number;
  vibrateIdle?: string;
  vibrateError?: string;
  priority?: "high" | "low" | "default" | "max";
  sound?: boolean;
  requireTermux?: boolean;
  kinds?: Array<"idle" | "error">;
  titleIdle?: string;
  titleError?: string;
  contentIdle?: string;
  contentError?: string;
}

declare const plugin: Plugin;
export default plugin;
