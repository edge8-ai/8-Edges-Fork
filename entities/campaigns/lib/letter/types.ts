import type { BrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import type { Letter } from "./data";
import { OPS_EMAIL } from "@/kernel/config/contacts";

// What every step receives and returns. A step is a function of the letter
// and its brand profile that reads and writes through ./data; it never
// decides what runs next.
export type StepContext = { letter: Letter; profile: BrandProfile };

export type StepResult = { ok: true; summary: string } | { ok: false; error: string };

export type StepRunner = (ctx: StepContext) => Promise<StepResult>;

export const LETTER_ACTOR = "letter-agent";

// Where the validate step's test goes, and who is greeted in it.
export function testRecipient(): string {
  return process.env.MARKETING_TEST_TO?.trim() || OPS_EMAIL;
}
