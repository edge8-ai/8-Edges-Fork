// The learnings as another page reads and answers them (QS.4; quests spec,
// "The Lore is Spark's learnings"). The Quests page's Lore is Spark's learning
// sparks, so its questions are asked here, of the tables this entity owns: the
// newest learnings with their authors and how many people other than the
// author will try each, a learning posted from a one-line composer, and Will
// try, which is Spark's own `me_too` reaction. Nothing here names who will
// try a learning: the count is all another page gets. Spark's own page goes on
// naming them, as it always has.
import { companyOs } from "@/kernel/data/supabase";
import { mustCount, ReadFailure } from "@/kernel/data/read";
import { NAME_ONLY_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { cleanSparkTitle } from "./spark-line";
import { postSpark, setSparkReaction } from "./spark-store";

/** How many learnings a page shows before "Read all in Spark". */
export const LEARNINGS_SHOWN = 6;

export type Learning = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  postedAt: string;
  /** Distinct people other than the author who said they will try it. */
  willTry: number;
  /** Whether the reader is one of them. Always false on the reader's own learning. */
  youWillTry: boolean;
};

export type Learnings = {
  learnings: Learning[];
  /** Whether the reader has ever posted a spark of either kind, so a page can tell their first one apart. */
  readerHasSparked: boolean;
};

/**
 * What a learning the Lore draws is, said once: Spark's learning kind, not
 * archived. The newest-learnings read and the season count start from
 * selectLoreLearnings, and Will try checks one row with isLoreLearning, so the
 * three can never disagree about which learnings a page may show.
 */
const LORE_LEARNING = { kind: "learning", hidden: "archived" } as const;

type IdeaRow = Record<string, unknown>;

/** The learnings the Lore draws, with the caller's own columns and options. */
const selectLoreLearnings = (columns: string, options?: { count?: "exact"; head?: boolean }) =>
  companyOs.from("ideas").select<string, IdeaRow>(columns, options).eq("kind", LORE_LEARNING.kind).neq("status", LORE_LEARNING.hidden);

/** The same rule on one idea already read. */
const isLoreLearning = (idea: { kind: string; status: string }) => idea.kind === LORE_LEARNING.kind && idea.status !== LORE_LEARNING.hidden;

type LearningRow = { id: string; person_id: string; title: string; created_at: string; people: NamedPerson | NamedPerson[] | null };
type WillTryRow = { idea_id: string; person_id: string };

/**
 * The learnings as a reader sees them, from the rows. A will try from the
 * author on their own learning is not counted (Spark refuses one, but a row
 * written before that rule must not inflate the count), and each person counts
 * once however many rows they left.
 */
export function shapeLearnings(rows: LearningRow[], willTry: WillTryRow[], readerId: string): Learning[] {
  const triers = new Map<string, Set<string>>();
  for (const r of willTry) {
    const set = triers.get(r.idea_id) ?? new Set<string>();
    set.add(r.person_id);
    triers.set(r.idea_id, set);
  }
  return rows.map((r) => {
    const people = new Set(triers.get(r.id) ?? []);
    people.delete(r.person_id);
    return {
      id: r.id,
      authorId: r.person_id,
      authorName: personName(Array.isArray(r.people) ? r.people[0] : r.people, "A teammate"),
      title: r.title,
      postedAt: r.created_at,
      willTry: people.size,
      youWillTry: people.has(readerId),
    };
  });
}

/**
 * The newest learnings, newest first, and whether the reader has sparked
 * before. Every read raises on failure: an empty Lore from a failed read would
 * tell the reader nobody has learned anything.
 */
export async function readLearnings(readerId: string, limit = LEARNINGS_SHOWN): Promise<Learnings> {
  const { data: learningRows, error: learningsError } = await selectLoreLearnings(`id, person_id, title, created_at, people:people!person_id(${NAME_ONLY_COLUMNS})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (learningsError) throw new ReadFailure("[ideas/learnings] ideas", learningsError.message);
  const rows = (learningRows ?? []) as unknown as LearningRow[];

  const { count: sparked, error: sparkedError } = await companyOs.from("ideas").select("id", { count: "exact", head: true }).eq("person_id", readerId);
  if (sparkedError) throw new ReadFailure("[ideas/learnings] reader's sparks", sparkedError.message);

  let willTry: WillTryRow[] = [];
  if (rows.length > 0) {
    const { data: tryRows, error: tryError } = await companyOs
      .from("idea_reactions")
      .select("idea_id, person_id")
      .eq("kind", "me_too")
      .is("archived_at", null)
      .in(
        "idea_id",
        rows.map((r) => r.id),
      );
    if (tryError) throw new ReadFailure("[ideas/learnings] idea_reactions", tryError.message);
    willTry = (tryRows ?? []) as WillTryRow[];
  }
  return { learnings: shapeLearnings(rows, willTry, readerId), readerHasSparked: (sparked ?? 0) > 0 };
}

/**
 * How many learnings went up since a moment, for the Quests season banner's
 * company total (QS.14): the whole company's count, never a person's, of the
 * learnings the Lore draws (an archived one is not counted). A failed count
 * raises, because a zero from a failed read would hide the banner.
 */
export async function countLearningsSince(since: string): Promise<number> {
  return mustCount(
    await selectLoreLearnings("id", { count: "exact", head: true }).gte("created_at", since),
    "[ideas/learnings] learnings since",
  );
}

type Ok = { ok: true };
type Err = { ok: false; error: string };

/**
 * Posts one line as the person's learning spark, through the same insert as
 * every spark (postSpark) and under the same line rule as Spark's composer.
 * It lives in Spark from then on, with every right Spark gives its author.
 */
export async function postLearning(personId: string, line: string): Promise<(Ok & { id: string }) | Err> {
  const clean = cleanSparkTitle(line);
  if (!clean.ok) return { ok: false, error: clean.tooLong ? `${clean.error} Add the story in Spark after you share it.` : "Write what you learned first, in one line." };
  const { data, error } = await postSpark(personId, { kind: "learning", title: clean.title });
  if (error || !data) return { ok: false, error: "Could not share your learning. Try again in a moment." };
  return { ok: true, id: data.id };
}

/**
 * Says, or takes back, that the person will try a learning: Spark's own
 * `me_too` reaction. Only on someone else's learning that is still up.
 */
export async function sayWillTry(personId: string, ideaId: string, on: boolean): Promise<Ok | Err> {
  const { data, error } = await companyOs.from("ideas").select("id, person_id, kind, status").eq("id", ideaId).maybeSingle();
  if (error) return { ok: false, error: "Could not read that learning. Try again in a moment." };
  const idea = data as { id: string; person_id: string; kind: string; status: string } | null;
  if (!idea || !isLoreLearning(idea)) return { ok: false, error: "That learning isn't here any more." };
  if (idea.person_id === personId) return { ok: false, error: "That's your own learning." };
  return setSparkReaction(personId, ideaId, "me_too", on);
}
