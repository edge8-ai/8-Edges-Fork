import type { BadgeTone } from "@/kernel/ui/Badge";
import type { ClientReviewStage } from "@/entities/org/lib/client-reviews/rules";

// The stages in the order a review moves through them, each with its words
// and its badge. The stage itself comes from the rules module (memberStage),
// read on every load and never stored. The cycle overview and the member's
// page both say a stage in these words (CR.3.3).
export const STAGES: { stage: ClientReviewStage; label: string; tone: BadgeTone }[] = [
  { stage: "waiting_on_member", label: "Waiting on member", tone: "neutral" },
  { stage: "waiting_on_client_manager", label: "Waiting on client manager", tone: "warn" },
  { stage: "waiting_on_skip_manager", label: "Waiting on skip-manager", tone: "info" },
  { stage: "ready_to_release", label: "Ready to release", tone: "ok" },
  { stage: "released", label: "Released", tone: "ok" },
  { stage: "withdrawn", label: "Withdrawn", tone: "neutral" },
];

export const STAGE = new Map(STAGES.map((s) => [s.stage, s]));
