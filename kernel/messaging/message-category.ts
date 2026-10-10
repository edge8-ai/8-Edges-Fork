// What a logged message was about, as opposed to how it travelled.
//
// interactions.kind says the channel (email, lark, whatsapp). category says the
// subject, so "every Goals message to one person this quarter" is one filter
// rather than a guess across a dozen source labels. The list is fixed by
// interactions_category_check (migration 20261005120000), and that migration's
// backfill applies the same rules as categoryForEmail below to the rows that
// existed before it; change one and you change the other.

export const MESSAGE_CATEGORIES = [
  "workboard",
  "one_on_one",
  "goals",
  "reviews",
  "onboarding",
  "people_ops",
  "client",
  "marketing",
  "account",
  "other",
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

const SOURCE_CATEGORY: Record<string, MessageCategory> = {
  "coaching-cycle": "one_on_one",
  "team-fast-goals": "goals",
  "onboarding-cycle": "onboarding",
  onboarding: "onboarding",
  marketing_campaign: "marketing",
  marketing_test: "marketing",
  letter_agent_test: "marketing",
  portal_invite: "client",
  gmail: "client",
  email: "client",
  inbound_email: "client",
  lark_mail: "client",
  manual_entry: "client",
  admin_self_serve_link: "account",
  team_self_serve_link: "account",
  team_self_serve_reset: "account",
  portal_self_serve_link: "account",
  portal_self_serve_reset: "account",
  portal_temp_password: "account",
  portal_resend: "account",
};

// metadata.kind values that the generic "system" source carries.
const SYSTEM_KIND_CATEGORY: Record<string, MessageCategory> = {
  "board-digest": "workboard",
  review_reminder: "reviews",
  review_open_self: "reviews",
  review_open_manager: "reviews",
  resend_fixed_link: "one_on_one",
};

// Subjects of "system" emails that carry no kind, matched from the start.
const SYSTEM_SUBJECT_CATEGORY: [RegExp, MessageCategory][] = [
  [/^mid-year/i, "reviews"],
  [/^probation/i, "onboarding"],
  [/^marketing/i, "marketing"],
  [/^(time off|your time off|approved|bank details|new work request|more info needed)/i, "people_ops"],
  [/^your .* (sign-in|access)/i, "account"],
];

/**
 * The category of an email from the metadata its sender logged. An explicit
 * metadata.category wins; otherwise the source decides, then the "system"
 * source's kind, then its subject. Anything unmatched is "other", never a
 * guess.
 */
export function categoryForEmail(meta: Record<string, unknown> | undefined, subject: string): MessageCategory {
  const explicit = meta?.category;
  if (typeof explicit === "string" && (MESSAGE_CATEGORIES as readonly string[]).includes(explicit)) {
    return explicit as MessageCategory;
  }
  const source = String(meta?.source ?? "system");
  const bySource = SOURCE_CATEGORY[source];
  if (bySource) return bySource;
  if (source !== "system") return "other";
  const kind = typeof meta?.kind === "string" ? SYSTEM_KIND_CATEGORY[meta.kind] : undefined;
  if (kind) return kind;
  for (const [pattern, category] of SYSTEM_SUBJECT_CATEGORY) if (pattern.test(subject)) return category;
  return "other";
}
