// The server actions the Asks page hands its client components, with the
// QS.1 contract's (v2) signatures. The page passes the real ones from
// ../lib/quest-actions. The type is the UI's own, so a component never imports
// the "use server" module itself: the page owns that edge. The shapes come from
// the kernel's Result and the pure rules' input schema, so nothing is spelled
// twice.
import type { z } from "zod";
import type { Result } from "@/kernel/data/result";
import type { SummonInput } from "../lib/quest-rules";

export type QuestActions = {
  summonBounty: (input: z.input<typeof SummonInput>) => Promise<Result & { questId?: string }>;
  turnIn: (questId: string, headId: string, input: { text: string; url?: string; toLore?: boolean }) => Promise<Result>;
  reactToTurnIn: (questId: string, headId: string, personId: string, line: string) => Promise<Result>;
  closeQuest: (questId: string) => Promise<Result>;
  withdrawQuest: (questId: string) => Promise<Result>;
};
