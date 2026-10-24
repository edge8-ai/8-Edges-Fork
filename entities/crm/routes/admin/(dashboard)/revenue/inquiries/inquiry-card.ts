import type { QualifierView } from "@/entities/crm/lib/inquiry-triage-shapes";

// One card of the Inquiries board, as the page hands it to the client components.

export type InquiryCard = {
  id: string;
  columnId: string;
  type: string | null;
  subject: string | null;
  message: string | null;
  source: string | null;
  created_at: string;
  deal_id: string | null;
  personId: string | null;
  personName: string | null;
  personEmail: string | null;
  doNotContact: boolean;
  /** The inquiry-to-lead chain's read and run (Z.11); null when it was never read. */
  qualifier: QualifierView | null;
};
