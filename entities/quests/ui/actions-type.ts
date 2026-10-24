// The server actions the Quests page hands its client components, with the
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
  acceptQuest: (questId: string) => Promise<Result>;
  turnIn: (questId: string, headId: string, input: { text: string; url?: string; toLore?: boolean }) => Promise<Result>;
  handBack: (questId: string, headId: string, note: string) => Promise<Result>;
  reactToTurnIn: (questId: string, headId: string, personId: string, line: string) => Promise<Result>;
  closeQuest: (questId: string) => Promise<Result>;
  withdrawQuest: (questId: string) => Promise<Result>;
};

/** The Lore's two moves (QS.4), from ../lib/lore-actions: share a learning, and say Will try on someone else's. */
export type LoreActions = {
  shareLearning: (line: string) => Promise<Result & { id?: string }>;
  willTry: (ideaId: string, on: boolean) => Promise<Result>;
};

/**
 * Lighthouses' one move (QS.6), from ../lib/beacon-actions: light a Beacon
 * with what was put out and its link, from a held fire when one is named.
 * QS.13's next move and QS.7's Evolve open the same form, so they call this too.
 */
export type BeaconActions = {
  lightBeacon: (input: { title: string; url: string; originQuestId?: string | null }) => Promise<Result & { questId?: string }>;
};

/** Campfires' moves (QS.5), from ../lib/campfire-actions: a hand raised and lowered, a cold fire lit, a seat taken and left. */
export type CampfireActions = {
  raiseHand: (topic: string) => Promise<Result>;
  lowerHand: (topicKey: string) => Promise<Result>;
  lightFire: (topicKey: string, startsAt: string) => Promise<Result & { questId?: string }>;
  takeSeat: (questId: string) => Promise<Result>;
  leaveSeat: (questId: string) => Promise<Result>;
};
