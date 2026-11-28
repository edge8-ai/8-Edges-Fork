// The personal email agent: one body written for one person by an agent with
// context (the sources it may read), a versioned skill (the brief) and a
// rhythm. These are the shapes the data layer, the sources, the run and the
// pages share. Plan: /workflows/private/e8/email-broadcast-and-personal-plan.html

// What the agent may read about a person. Each key is one function in
// sources.ts; the agent row ticks the ones it wants. A new kind of context is
// a new key here and one function there, never a new kind of agent.
export const SOURCE_KEYS = ["learner_progress", "coaching", "crm", "past_emails", "tags"] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export const SOURCE_LABEL: Record<SourceKey, string> = {
  learner_progress: "Certification progress",
  coaching: "Coaching sessions",
  crm: "Deals and last contact",
  past_emails: "Emails we sent them",
  tags: "Tags and company",
};


export function isSourceKey(value: string): value is SourceKey {
  return (SOURCE_KEYS as readonly string[]).includes(value);
}

// One dated, sourced thing we know about the person. The writer may only say
// what is in these; the validator holds a message that says more.
export type Fact = { date: string; fact: string; source: SourceKey };

export type ReviewMode = "hold_all" | "sample";

export type AgentRow = {
  id: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  audienceId: string;
  audienceName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  sources: SourceKey[];
  cadenceDays: number;
  sendHour: number;
  reviewMode: ReviewMode;
  sampleSize: number;
  maxWords: number;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type SkillRow = {
  id: string;
  agentId: string;
  version: number;
  bodyMd: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type MessageStatus = "drafted" | "held" | "approved" | "sending" | "sent" | "skipped" | "cancelled";

export const MESSAGE_STATUSES: MessageStatus[] = ["drafted", "held", "approved", "sending", "sent", "skipped", "cancelled"];


export type MessageRow = {
  id: string;
  agentId: string;
  skillId: string;
  skillVersion: number | null;
  personId: string;
  recipientName: string | null;
  personEmail: string | null;
  routineRunId: string | null;
  status: MessageStatus;
  holdReason: string | null;
  skipReason: string | null;
  subject: string;
  bodyMd: string;
  facts: Fact[];
  editedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sendAfter: string | null;
  claimedAt: string | null;
  sentAt: string | null;
  resendEmailId: string | null;
  error: string | null;
  interactionId: string | null;
  createdAt: string;
  updatedAt: string;
};

// The person as the run sees them: enough to gate, gather and address.
export type Recipient = {
  id: string;
  email: string;
  firstName: string;
  // The name to show, never the email: both readers print the email beside it.
  name: string;
  timezone: string | null;
  country: string | null;
};
