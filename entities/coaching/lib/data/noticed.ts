import { companyOs } from "@/kernel/data/supabase";
import { selectCoreValues } from "@/entities/org";
import { one } from "@/kernel/config/embedded";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { assertCoachOwnsProfile, type Result } from "./shared";
import { type PersonEmbed } from "./rows";
import { NOTICED_MAX } from "../noticed-shared";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

// "Noticed" — one sentence about a piece of work, tied to a company value (L.4).
//
// Read this before adding anything here. The feature is defined as much by what
// it refuses as by what it does, and the refusals live in the shapes below.
//
// `NoticedRow` carries a sentence, a value, a date and who wrote it. There is
// no count on it, no score, no reaction and no rank, and there is deliberately
// no function in this file that returns noticed rows for more than one person.
// Values-tagging is the half of the recognition category that works — it makes
// the writer name a behaviour instead of typing "great job" — and the points,
// the redemption, the public feed and the analytics are the half left behind.
//
// If a caller ever wants "who has the most", the answer is that this table does
// not answer that, and the wanting is the bug.

export type NoticedRow = {
  id: string;
  body: string;
  /** What the work was, when the writer named it. */
  subject: string | null;
  /** The company value the behaviour showed; null when that value was retired. */
  valueTitle: string | null;
  writtenBy: string;
  noticedOn: string;
};

// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
const NOTICED_SELECT =
  `id, body, subject, value_id, noticed_on, team_members:team_members!written_by(people:people!person_id(${NAME_COLUMNS}, avatar_url))`;

/**
 * Every noticed sentence about ONE person, newest first.
 *
 * Scoped to a single coaching profile by signature, not by a filter a caller
 * might forget: there is no variant that takes a list of profiles, because a
 * list is how a timeline becomes a leaderboard.
 */
export async function getNoticedFor(profileId: string): Promise<NoticedRow[]> {
  if (!profileId) return [];
  const { data, error } = await companyOs
    .from("coaching_noticed")
    .select(NOTICED_SELECT)
    .eq("coaching_profile_id", profileId)
    .is("archived_at", null)
    .order("noticed_on", { ascending: false });
  if (error) {
    console.error("[team/coaching/noticed] coaching_noticed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const valueIds = [...new Set(rows.map((r) => r.value_id).filter(Boolean) as string[])];
  const titles = new Map<string, string>();
  if (valueIds.length > 0) {
    // The values are org's, read through org's door — coaching already imports
    // from it for the goal ladder.
    const { data: vals, error: valsError } = await selectCoreValues("id, title").in("id", valueIds);
    if (valsError) console.error("[team/coaching/noticed] core_values", valsError);
    for (const v of (vals ?? []) as { id: string; title: string }[]) titles.set(v.id, v.title);
  }

  return rows.map((r) => {
    const tm = one(r.team_members as Record<string, unknown> | Record<string, unknown>[] | null);
    const person = one((tm?.people ?? null) as PersonEmbed | PersonEmbed[] | null);
    return {
      id: r.id as string,
      body: r.body as string,
      subject: (r.subject as string | null) ?? null,
      valueTitle: r.value_id ? (titles.get(r.value_id as string) ?? null) : null,
      writtenBy: personName(person, "-"),
      noticedOn: r.noticed_on as string,
    };
  });
}

/** The values a coach may tag a sentence with, for the write form. */
export async function getNoticeableValues(): Promise<{ id: string; title: string }[]> {
  const { data, error } = await selectCoreValues("id, title, sort_order").order("sort_order");
  if (error) {
    console.error("[team/coaching/noticed] core_values", error);
    return [];
  }
  return ((data ?? []) as { id: string; title: string }[]).map((v) => ({ id: v.id, title: v.title }));
}

/** A coach writes one, about a person they actually coach. */
export async function coachAddNoticed(
  actor: TeamActor,
  profileId: string,
  input: { body: string; valueId: string | null; subject: string | null },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const body = input.body.trim().slice(0, NOTICED_MAX);
  if (!body) return { ok: false, error: "Write the sentence first." };
  const { error } = await companyOs.from("coaching_noticed").insert({
    coaching_profile_id: profileId,
    written_by: actor.teamMemberId,
    value_id: input.valueId || null,
    body,
    subject: input.subject?.trim() || null,
  });
  return error ? { ok: false, error: "Could not save it." } : { ok: true };
}
