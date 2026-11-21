// Context assembly for the coaching generators (ai.ts): the blocks of text a
// prompt is handed, one loader per block, each a plain string so a generator
// composes its user message by concatenation. Split out of ai.ts on
// 2026-09-16 (K.4) when that file crossed its size allowlist; nothing here
// calls a model or writes a row.

import { createHash } from "node:crypto";
import { COACHING_PREP_PROMPT, COACHING_SUMMARY_PROMPT } from "./ai.prompt";
import { HOW_I_WORK, toHowIWork, type HowIWork } from "./how-i-work";
import { companyOs } from "@/kernel/data/supabase";
import {
  clip,
  MAX_DOC_CHARS,
  loadAllCommitmentsBlock,
  loadCheckinsBlock,
  loadCoachDocs,
  loadGoalsBlock,
  loadLastSharedRecap,
  loadModeHistoryBlock,
  loadOpenCommitments,
  loadPrioritiesBlock,
  loadPriorTrend,
  loadTalkingPoints,
} from "./ai-blocks";

// The text budget and the clipper live with the readers that apply them; both
// are re-exported here because ai.ts and group-summary.ts format with them too.
export { MAX_DOC_CHARS, clip } from "./ai-blocks";
import { one } from "@/kernel/config/embedded";
import { type RecapLanguage } from "./types";
import { loadPreMeetingAnswers } from "./data/pre-meeting";
import { NAME_ONLY_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Input clamps: keep any one document from flooding the context window.

export type ProfileContext = {
  profileId: string;
  coachId: string;
  memberName: string;
  positionTitle: string | null;
  retentionRoot: string | null;
  privateProfileMarkdown: string | null;
  // What the MEMBER wrote about how they work (L.3). In the prep because the
  // most useful thing a coach can walk in knowing is how this person wants to
  // be worked with, in their own words rather than in a read of them.
  howIWork: HowIWork;
  cadenceDays: number;
  // Null means the shared recap follows the transcript (K.12).
  recapLanguage: RecapLanguage | null;
};

export async function loadProfileContext(profileId: string): Promise<ProfileContext | null> {
  const { data, error: profileError } = await companyOs
    .from("coaching_profiles")
    .select(
      "id, coach_id, retention_root, private_profile_markdown, cadence_days, recap_language, " +
        "how_best_hours_md, how_feedback_md, how_quiet_md, how_curious_md, " +
        `team_members:team_members!team_member_id(people:people!person_id(${NAME_ONLY_COLUMNS}), ` +
        "positions:positions!position_id(title))",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (profileError) console.error("[coaching-ai] coaching_profiles", profileError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const person = one(
    (tm?.people ?? null) as NamedPerson | NamedPerson[] | null,
  );
  const pos = one((tm?.positions ?? null) as { title: string | null } | { title: string | null }[] | null);
  return {
    profileId,
    coachId: r.coach_id as string,
    // Sent to the model, which must never be handed an address as a name (S.16.16).
    memberName: personName(person && { ...person, email: null }, "the team member"),
    positionTitle: pos?.title ?? null,
    retentionRoot: (r.retention_root as string | null) ?? null,
    privateProfileMarkdown: (r.private_profile_markdown as string | null) ?? null,
    howIWork: toHowIWork(r),
    cadenceDays: (r.cadence_days as number) ?? 14,
    recapLanguage: (r.recap_language as RecapLanguage | null) ?? null,
  };
}










export function personBlock(p: ProfileContext): string {
  return [
    `Name: ${p.memberName}`,
    p.positionTitle ? `Role: ${p.positionTitle}` : null,
    p.retentionRoot
      ? `Loose engagement root (embeddedness read): ${p.retentionRoot}${p.retentionRoot === "watching" ? " (no confident read yet)" : ""}`
      : null,
    p.privateProfileMarkdown
      ? `\n<coaching-reads>\n${clip(p.privateProfileMarkdown, MAX_DOC_CHARS)}\n</coaching-reads>`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}




// The "Recap language" line the summariser is handed. The coach's pinned value
// wins; null hands the choice to the model, which follows the language the
// member themselves spoke most of the meeting in (K.12).
// The lines are parts of the coaching-summary prompt, so an edit to one changes
// its version (Z.6.1).
export function recapLanguageLine(p: ProfileContext): string {
  const { recapLanguageVi, recapLanguageEn, recapLanguageFollow } = COACHING_SUMMARY_PROMPT.parts;
  if (p.recapLanguage === "vi") return recapLanguageVi;
  if (p.recapLanguage === "en") return recapLanguageEn;
  return recapLanguageFollow;
}

// The transcript a 1-1 row carries. It lives on the linked meeting
// (call_transcripts) and nowhere else since K.11 dropped the legacy
// coaching_one_on_ones.transcript mirror.
export type TranscriptCarrier = {
  linked_meeting?:
    | { call_transcripts?: { transcript: string | null }[] | { transcript: string | null } | null }
    | { call_transcripts?: unknown }[]
    | null;
};

export function transcriptOf(m: TranscriptCarrier): string | null {
  const lm = Array.isArray(m.linked_meeting) ? m.linked_meeting[0] : m.linked_meeting;
  const ct = lm?.call_transcripts as
    | { transcript: string | null }[]
    | { transcript: string | null }
    | null
    | undefined;
  return (Array.isArray(ct) ? ct[0]?.transcript : ct?.transcript) ?? null;
}

// The identity of a transcript, so a re-run on unchanged text can skip the
// model call it would otherwise repeat (K.12).
export function transcriptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * "How I work" as a prompt block (L.3).
 *
 * Member-authored standing context, which is why it is in the prep at all while
 * the coach's own standing documents are not: the prep is built from what the
 * member said and what changed, and this is the member speaking.
 */
export function howIWorkBlock(h: HowIWork): string {
  const lines = HOW_I_WORK.filter((p) => h[p.key]?.trim()).map((p) => `- ${p.label}: ${h[p.key]}`);
  // The fallback is a part of the coaching-prep prompt, so it is versioned (Z.6.1).
  return lines.length > 0 ? lines.join("\n") : COACHING_PREP_PROMPT.parts.howIWorkUnwritten;
}

// ---- what each generator shows the model ------------------------------------
//
// One function per generator. "What does the trend report know about this
// person?" is answered by reading one of these three lists, rather than by
// cross-referencing a caller's hand-written Promise.all against the readers
// above — which is how three call sites came to each assemble their own basket
// of the same blocks. The readers are internal to this module now: a generator
// asks for a context, not for blocks.
//
// Every one of these takes the ProfileContext rather than an id, because all
// three generators have already loaded it (two of them need it for the prompt's
// own "# The person" section) and loading it twice would be a second read of the
// same row in the same request.

export type PrepContext = {
  lastRecap: string;
  commitments: string;
  talkingPoints: string;
  goals: string;
  priorities: string;
  preMeeting: string;
};

// Deliberately not loaded: the coach's context documents, the private profile
// essay and the mode history. They made the prep a page nobody read; the ten
// bullets are grounded in what changed since the last 1-1, which is these
// blocks.
//
// "How I work" (L.3) IS included, and the distinction is deliberate: every item
// on the exclusion list above is COACH-authored standing material, and this prep
// already opens with the member's own verbatim words. Four short lines the
// member wrote about how they want to be worked with is the same kind of input
// as the pre-meeting form, not the same kind as an essay about them — and it is
// about forty words, not a page. It travels on the ProfileContext, so it is not
// a block of its own.
export async function prepContext(profile: ProfileContext): Promise<PrepContext> {
  const [lastRecap, commitments, talkingPoints, goals, priorities, preMeeting] = await Promise.all([
    loadLastSharedRecap(profile.profileId),
    loadOpenCommitments(profile.profileId),
    loadTalkingPoints(profile.profileId),
    loadGoalsBlock(profile.profileId),
    loadPrioritiesBlock(profile.profileId),
    loadPreMeetingAnswers(profile.profileId),
  ]);
  return { lastRecap, commitments, talkingPoints, goals, priorities, preMeeting };
}

export type RecapContext = {
  docs: string;
  commitments: string;
  goals: string;
};

// The narrowest of the three: the transcript carries the meeting, so the model
// needs only what it cannot read there — the coach's standing documents, the
// goals, and what was already owed going in.
export async function recapContext(profile: ProfileContext): Promise<RecapContext> {
  const [docs, commitments, goals] = await Promise.all([
    loadCoachDocs(profile.coachId),
    loadOpenCommitments(profile.profileId),
    loadGoalsBlock(profile.profileId),
  ]);
  return { docs, commitments, goals };
}

export type TrendContext = {
  docs: string;
  commitments: string;
  priorTrend: string;
  checkins: string;
  goals: string;
  modeHistory: string;
};

// The widest. `period` is the month the report is filed under, so the prior
// report can be found; `sinceHeldOn` is the day of the OLDEST 1-1 in the window,
// so the check-ins counted are the ones inside it rather than all of them.
export async function trendContext(
  profile: ProfileContext,
  period: string,
  sinceHeldOn: string,
): Promise<TrendContext> {
  const [docs, commitments, priorTrend, checkins, goals, modeHistory] = await Promise.all([
    loadCoachDocs(profile.coachId),
    loadAllCommitmentsBlock(profile.profileId),
    loadPriorTrend(profile.profileId, period),
    loadCheckinsBlock(profile.profileId, sinceHeldOn),
    loadGoalsBlock(profile.profileId),
    loadModeHistoryBlock(profile.profileId),
  ]);
  return { docs, commitments, priorTrend, checkins, goals, modeHistory };
}
