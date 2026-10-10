// The two summary tiers of a 1-1, and the gate that shows the shared one to the
// member. Split out of one-on-ones.ts, which had reached its size cap while the
// Lark hold was being wired in: that file is about the life of a booking — made,
// moved, skipped, held — and this one is about what the meeting left behind.
//
// The split is along that line rather than along the line count: publishing a
// recap changes nothing about when the meeting is, and moving a meeting changes
// nothing about its recap.

import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyBoth } from "@/entities/coaching/lib/cycle-shared";
import { OPEN_COMMITMENT_STATUSES } from "../types";
import { one } from "@/kernel/config/embedded";
import { assertCoachOwnsMeeting } from "./one-on-ones";
import { Result, patchMeeting } from "./shared";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
// Coach edits of the two summary tiers. Editing the shared recap does NOT
// publish it; publish is its own explicit action.
export async function coachSaveSummaries(
  actor: TeamActor,
  meetingId: string,
  summaryMarkdown: string,
  sharedSummaryMarkdown: string,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  return patchMeeting(meetingId, {
    summary_markdown: summaryMarkdown.trim() || null,
    shared_summary_markdown: sharedSummaryMarkdown.trim() || null,
  });
}

// The publish gate: only after this does the member see the shared recap.
export async function coachPublishSharedRecap(
  actor: TeamActor,
  meetingId: string,
  publish: boolean,
): Promise<Result> {
  const owned = await assertCoachOwnsMeeting(actor, meetingId);
  if (!owned) return { ok: false, error: "Not found." };
  if (publish && !owned.meeting.sharedSummaryMarkdown?.trim())
    return { ok: false, error: "Write the shared recap before publishing." };
  const res = await patchMeeting(meetingId, {
    shared_published_at: publish ? new Date().toISOString() : null,
  });
  // The notification goes out after the publish has landed, and its failure is
  // never the publisher's problem (K.7, kept in K.15): the recap is visible on
  // the page either way, and a coach who clicked publish should not see an
  // error because Lark was down. Link only since K.15 (spec 4): no card, no
  // buttons, one line and the page.
  if (res.ok && publish) {
    try {
      await notifyRecapPublished(meetingId, owned.profileId, owned.meeting.heldOn);
    } catch (err) {
      console.error("[team/coaching/one-on-ones] recap notification", err instanceof Error ? err.message : err);
    }
  }
  return res;
}

// One plain message to the member when a recap is published: who, when, how
// many commitments are theirs to word, and the link. The count is the only
// number in it, and it counts commitments, never the person.
export async function notifyRecapPublished(
  meetingId: string,
  profileId: string,
  heldOn: string,
): Promise<boolean> {
  const { data, error } = await companyOs
    .from("coaching_profiles")
    .select(
      `coach_id, team_members:team_members!team_member_id(people:people!person_id(${NAME_COLUMNS}))`,
    )
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[team/coaching/one-on-ones] coaching_profiles", error);
    return false;
  }
  if (!data) return false;
  const r = data as unknown as Record<string, unknown>;
  const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
  const member = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
  const memberEmail = member?.email ?? null;
  if (!memberEmail) return false;

  const coachId = (r.coach_id as string | null) ?? null;
  let coachName = "Your coach";
  if (coachId) {
    const { data: coachRow, error: coachError } = await companyOs
      .from("team_members")
      .select(`people:people!person_id(${NAME_COLUMNS})`)
      .eq("id", coachId)
      .maybeSingle();
    if (coachError) console.error("[team/coaching/one-on-ones] team_members", coachError);
    const coach = one(
      ((coachRow as unknown as Record<string, unknown> | null)?.people ?? null) as PersonEmbed | PersonEmbed[] | null,
    );
    coachName = personName(coach, coachName);
  }

  const { count, error: countError } = await companyOs
    .from("coaching_commitments")
    .select("id", { count: "exact", head: true })
    .eq("coaching_profile_id", profileId)
    .eq("one_on_one_id", meetingId)
    .eq("owner", "member")
    .in("status", OPEN_COMMITMENT_STATUSES);
  if (countError) console.error("[team/coaching/one-on-ones] coaching_commitments", countError);
  const n = count ?? 0;

  const link = `${await getSiteOrigin()}/team/my-coaching`;
  const text = `${coachName} published the recap of your 1-1 on ${heldOn}. ${n} commitment${n === 1 ? " is" : "s are"} yours to word.`;
  return notifyBoth({
    email: memberEmail,
    subject: `Your 1-1 recap (${heldOn})`,
    html: `<p>${text}</p><p><a href="${link}">Your coaching page</a></p>`,
    larkText: `${text} ${link}`,
    logKind: "recap_published",
    links: [link],
  });
}

type PersonEmbed = NamedPerson;
