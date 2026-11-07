// Server-only. System prompt for the admin database assistant. Ordered
// stable-first so the whole block can be prompt-cached (cache_control goes on
// the last block in the route).
//
// The texts are the admin-chat prompt in ./system-prompt.prompt (Z.6.1), where
// they carry a version; this function only chooses and joins them.

import { fillPrompt } from "@/kernel/ai/prompts";
import { ADMIN_CHAT_PROMPT } from "./system-prompt.prompt";

export function buildSystemPrompt(opts: {
  userEmail: string | null;
  canWrite: boolean;
}): string {
  const { rules, writeMode, readOnlyMode, currentAdmin } = ADMIN_CHAT_PROMPT.parts;
  const parts = [ADMIN_CHAT_PROMPT.system, rules, opts.canWrite ? writeMode : readOnlyMode];
  if (opts.userEmail) {
    parts.push(fillPrompt(currentAdmin, { userEmail: opts.userEmail }));
  }
  return parts.join("\n\n");
}
