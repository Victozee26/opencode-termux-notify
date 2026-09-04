import type { Plugin } from "@opencode-ai/plugin/v2/promise";

export interface TermuxNotifyOptions {
  bin?: string;
  mediaBin?: string;
  sharedPath?: string;
  seenTTL?: number;
  sessionCooldown?: number;
  globalCooldown?: number;
  priority?: "high" | "low" | "default" | "max";
  sound?: boolean;
  playSound?: boolean;
  vibrate?: boolean;
  requireTermux?: boolean;
  kinds?: Array<"default" | "question" | "permission" | "error" | "done" | "subagent_done" | "idle">;
  notifySubagents?: boolean;
  title_default?: string;
  title_done?: string;
  title_subagent_done?: string;
  title_question?: string;
  title_permission?: string;
  title_error?: string;
  content_default?: string;
  content_done?: string;
  content_subagent_done?: string;
  content_question?: string;
  content_permission?: string;
  content_error?: string;
  // legacy
  vibrateIdle?: string;
  vibrateError?: string;
  titleIdle?: string;
  titleError?: string;
  contentIdle?: string;
  contentError?: string;
}

declare const plugin: Plugin;
export default plugin;
