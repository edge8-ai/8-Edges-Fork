import type { BrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import type { WriterCampaign } from "./data";

// What every step receives and returns. A step is a pure function of the
// campaign and its brand profile that reads and writes through ./data; it
// never decides what runs next.
export type StepContext = { campaign: WriterCampaign; profile: BrandProfile };

export type StepResult = { ok: true; summary: string } | { ok: false; error: string };

export type StepRunner = (ctx: StepContext) => Promise<StepResult>;

// The actor stamped on rows the pipeline writes.
export const WRITER_ACTOR = "writer-agent";
