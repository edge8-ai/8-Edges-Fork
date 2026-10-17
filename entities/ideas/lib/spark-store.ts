// The ideas entity's reads and writes of what comes back on a spark (ID.2.6,
// ID.2.7): reactions and builds. The entity owns both tables, so it writes them
// here and other entities reach them only through this door.
//
// Reads raise on failure (ReadFailure): a failed read must not render as "nobody
// answered", which would put answered sparks back in a deck and hide builds.
import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { publish } from "@/kernel/events";
import type { BuildRow, ReactionKind, ReactionRow } from "./spark-social";

const MAX_BUILD = 500;
const READ_LIMIT = 5000;

type Joined = { people: NamedPerson | NamedPerson[] | null };
const nameOf = (r: Joined) => personName(Array.isArray(r.people) ? r.people[0] : r.people, "A teammate");

/** Every live reaction and build, with the name of whoever made it. */
export async function readSparkSignals(): Promise<{ reactions: ReactionRow[]; builds: BuildRow[] }> {
  const { data: reactionRows, error: reactionsError } = await companyOs
    .from("idea_reactions")
    .select(`idea_id, person_id, kind, created_at, people:people!person_id(${NAME_ONLY_COLUMNS})`)
    .is("archived_at", null)
    .limit(READ_LIMIT);
  if (reactionsError) throw new ReadFailure("[ideas] idea_reactions", reactionsError.message);
  const { data: buildRows, error: buildsError } = await companyOs
    .from("idea_builds")
    .select(`id, idea_id, person_id, body, created_at, people:people!person_id(${NAME_ONLY_COLUMNS})`)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(READ_LIMIT);
  if (buildsError) throw new ReadFailure("[ideas] idea_builds", buildsError.message);
  const r = (reactionRows ?? []) as unknown as (Joined & { idea_id: string; person_id: string; kind: ReactionKind; created_at: string })[];
  const b = (buildRows ?? []) as unknown as (Joined & { id: string; idea_id: string; person_id: string; body: string; created_at: string })[];
  return {
    reactions: r.map((x) => ({ ideaId: x.idea_id, personId: x.person_id, kind: x.kind, createdAt: x.created_at, name: nameOf(x) })),
    builds: b.map((x) => ({ id: x.id, ideaId: x.idea_id, personId: x.person_id, body: x.body, createdAt: x.created_at, name: nameOf(x) })),
  };
}

type Ok = { ok: true };
type Err = { ok: false; error: string };

/**
 * Turns one reaction on or off. On is idempotent (the live-reaction index keeps
 * one per person, idea and kind); off archives, so the history stays.
 */
export async function setSparkReaction(personId: string, ideaId: string, kind: ReactionKind, on: boolean): Promise<Ok | Err> {
  if (on) {
    const { error } = await companyOs.from("idea_reactions").insert({ idea_id: ideaId, person_id: personId, kind });
    // 23505: already on. That is the state asked for, so it is not a failure.
    if (error && error.code !== "23505") return { ok: false, error: "Could not save that. Try again in a moment." };
    return { ok: true };
  }
  const { error } = await companyOs
    .from("idea_reactions")
    .update({ archived_at: new Date().toISOString(), archived_by: personId })
    .eq("idea_id", ideaId)
    .eq("person_id", personId)
    .eq("kind", kind)
    .is("archived_at", null);
  if (error) return { ok: false, error: "Could not save that. Try again in a moment." };
  return { ok: true };
}

/**
 * Adds a build and tells the spark's author: the fact goes on the bus and the
 * inbox decides (it says nothing to someone who built on their own spark).
 */
export async function addSparkBuild(
  actor: { personId: string; name: string },
  idea: { id: string; title: string; person_id: string },
  body: string,
): Promise<(Ok & { id: string }) | Err> {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Write a line first: your case, a twist, or what you would try." };
  if (text.length > MAX_BUILD) return { ok: false, error: "Keep a build to one or two lines, under 500 characters." };
  const { data, error } = await companyOs
    .from("idea_builds")
    .insert({ idea_id: idea.id, person_id: actor.personId, body: text })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not post your build. Try again in a moment." };
  await publish("idea.built", {
    ideaId: idea.id,
    buildId: data.id,
    body: text,
    actorName: actor.name,
    title: idea.title,
    assigneeId: idea.person_id,
    actorPersonId: actor.personId,
  });
  return { ok: true, id: data.id };
}

const CHECK_IN_KINDS = ["held", "trying", "unstuck"] as const;
export type CheckInAnswer = (typeof CHECK_IN_KINDS)[number];

/**
 * A check-in answer on a learning (ID.2.9). It replaces the person's earlier
 * answer, which is archived, so "still trying" can be asked again later and
 * only the latest answer stands.
 */
export async function answerSparkCheckIn(personId: string, ideaId: string, answer: CheckInAnswer): Promise<Ok | Err> {
  const { error: archiveError } = await companyOs
    .from("idea_reactions")
    .update({ archived_at: new Date().toISOString(), archived_by: personId })
    .eq("idea_id", ideaId)
    .eq("person_id", personId)
    .in("kind", [...CHECK_IN_KINDS])
    .is("archived_at", null);
  if (archiveError) return { ok: false, error: "Could not save that. Try again in a moment." };
  return setSparkReaction(personId, ideaId, answer, true);
}
