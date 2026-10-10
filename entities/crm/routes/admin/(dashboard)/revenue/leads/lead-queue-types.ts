import type { QualifierView } from "@/entities/crm/lib/inquiry-triage-shapes";

// One card of the SDR queue, as the page hands it to the client components.

export type QueueRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  source: string | null;
  stage: string;
  status: string;
  slaDueAt: string | null;
  attemptCount: number;
  pinnedAt: string | null;
  inquiry: { id: string; subject: string | null; message: string | null; createdAt: string; teamSize: string | null } | null;
  /** The inquiry-to-lead chain's read of the latest inquiry (Z.11); null when it was never read. */
  qualifier: QualifierView | null;
  qual: {
    goal: string;
    plan: string;
    challenge: string;
    timeline: string;
    budget: string;
    authority: string;
  };
};
