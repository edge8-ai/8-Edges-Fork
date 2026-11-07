// Server-only. System prompt for the /team portal assistant. Ordered stable-first
// so the whole block can be prompt-cached (cache_control goes on the last block
// in the route).
//
// The texts are the team-chat prompt in ./system-prompt.prompt (Z.6.1), where
// they carry a version; this function only joins them.

import { fillPrompt } from "@/kernel/ai/prompts";
import { TEAM_CHAT_PROMPT } from "./system-prompt.prompt";

export function buildSystemPrompt(opts: { userName: string | null }): string {
  const { rules, currentUser } = TEAM_CHAT_PROMPT.parts;
  const parts = [TEAM_CHAT_PROMPT.system, rules];
  if (opts.userName) {
    parts.push(fillPrompt(currentUser, { userName: opts.userName }));
  }
  return parts.join("\n\n");
}
