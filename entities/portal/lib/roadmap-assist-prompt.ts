// System prompt for the roadmap propose assist (PR 4): a deliberately small
// helper that turns a client's rough idea into one well-formed roadmap item.
// Not the 5Ds program-plan chat; two or three short questions, then a draft.
//
// Groups are per-company now, so the prompt is built per request from the
// client's own roadmap sections. The text is the roadmap-assist prompt in
// ./roadmap-assist.prompt (Z.6.1); this builds the section list it is filled with.

import type { RoadmapGroup } from "@/entities/client-programs";
import { fillPrompt } from "@/kernel/ai/prompts";
import { ROADMAP_ASSIST_PROMPT } from "./roadmap-assist.prompt";

export function buildRoadmapAssistPrompt(
  groups: Array<Pick<RoadmapGroup, "key" | "title" | "intro">>,
): string {
  const groupCatalog = groups
    .map((g) => `- "${g.key}": ${g.title}${g.intro ? ` (${g.intro})` : ""}`)
    .join("\n");

  return fillPrompt(ROADMAP_ASSIST_PROMPT.system, { groupCatalog });
}
