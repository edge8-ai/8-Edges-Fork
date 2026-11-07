// A second question for the ladders (LD.7; ADR 0021; the badge catalogue,
// docs/engineering/2026-10-21-ladders-badges.md): what a person did on Spark,
// as recorded, for the badges found by doing. Their sparks with their kind and
// how many source links each carries; the "it held", "will try" and "unstuck"
// marks they gave, each with the spark's kind and author; the build notes they
// added, with the spark's author; and the "it held" marks others gave their
// learning sparks. Each row carries its id, which is the witness a badge
// names, and when it was made, which only orders the witnesses.
//
// What is never asked: a skip, an admire or a "me too". The read names the
// three kinds a badge can rest on, so a skip does not reach the ladders at all
// (the catalogue's rule 4), and an archived mark or note is left out.
//
// Batched by person, chunked to keep each request's URL short, and paged
// because PostgREST answers at most a thousand rows a request.
import { mustPagesIn } from "@/kernel/data/read";
import { selectIdeaBuilds, selectIdeaReactions, selectIdeas } from "./reads";

export type SparkKind = "build" | "learning";

export type SparkFact = { id: string; kind: SparkKind; archived: boolean; sources: number; at: string };

/** A mark the person gave on a spark, with that spark's kind and author. */
export type MarkFact = { id: string; ideaId: string; kind: "held" | "trying" | "unstuck"; sparkKind: SparkKind; sparkBy: string; at: string };

/** A build note the person added to a spark, with that spark's author. */
export type BuildNoteFact = { id: string; ideaId: string; sparkBy: string; at: string };

/** An "it held" another person gave one of the person's learning sparks. */
export type HeldFact = { id: string; ideaId: string; by: string; at: string };

export type SparkFacts = { sparks: SparkFact[]; marksGiven: MarkFact[]; buildNotes: BuildNoteFact[]; heldReceived: HeldFact[] };

const MARKS = ["held", "trying", "unstuck"] as const;
type IdeaRow = { id: string; person_id: string; kind: SparkKind; status: string; source_urls: string[] | null; created_at: string };
type MarkRow = { id: string; idea_id: string; person_id: string; kind: (typeof MARKS)[number]; created_at: string };
type NoteRow = { id: string; idea_id: string; person_id: string; created_at: string };

const IDEA_COLUMNS = "id, person_id, kind, status, source_urls, created_at";

/** Each person's Spark facts; a person with none gets empty lists. */
export async function sparkFactsOf(personIds: readonly string[]): Promise<Map<string, SparkFacts>> {
  const out = new Map<string, SparkFacts>(personIds.map((id) => [id, { sparks: [], marksGiven: [], buildNotes: [], heldReceived: [] }]));
  if (personIds.length === 0) return out;
  const [own, marks, notes] = await Promise.all([
    mustPagesIn<IdeaRow>(personIds, "[ideas/act-facts] sparks", (ids, from, to) => selectIdeas(IDEA_COLUMNS).in("person_id", ids).order("id").range(from, to)),
    mustPagesIn<MarkRow>(personIds, "[ideas/act-facts] marks given", (ids, from, to) =>
      selectIdeaReactions("id, idea_id, person_id, kind, created_at").in("person_id", ids).in("kind", [...MARKS]).is("archived_at", null).order("id").range(from, to),
    ),
    mustPagesIn<NoteRow>(personIds, "[ideas/act-facts] build notes", (ids, from, to) => selectIdeaBuilds("id, idea_id, person_id, created_at").in("person_id", ids).is("archived_at", null).order("id").range(from, to)),
  ]);
  const ideas = new Map<string, IdeaRow>(own.map((i) => [i.id, i]));
  const missing = [...new Set([...marks, ...notes].map((r) => r.idea_id))].filter((id) => !ideas.has(id));
  const learningIds = own.filter((i) => i.kind === "learning").map((i) => i.id);
  const [others, held] = await Promise.all([
    mustPagesIn<IdeaRow>(missing, "[ideas/act-facts] sparks marked", (ids, from, to) => selectIdeas(IDEA_COLUMNS).in("id", ids).order("id").range(from, to)),
    mustPagesIn<MarkRow>(learningIds, "[ideas/act-facts] held received", (ids, from, to) =>
      selectIdeaReactions("id, idea_id, person_id, kind, created_at").in("idea_id", ids).eq("kind", "held").is("archived_at", null).order("id").range(from, to),
    ),
  ]);
  for (const i of others) ideas.set(i.id, i);
  for (const i of own) out.get(i.person_id)?.sparks.push({ id: i.id, kind: i.kind, archived: i.status === "archived", sources: i.source_urls?.length ?? 0, at: i.created_at });
  for (const m of marks) {
    const spark = ideas.get(m.idea_id);
    if (spark) out.get(m.person_id)?.marksGiven.push({ id: m.id, ideaId: m.idea_id, kind: m.kind, sparkKind: spark.kind, sparkBy: spark.person_id, at: m.created_at });
  }
  for (const n of notes) {
    const spark = ideas.get(n.idea_id);
    if (spark) out.get(n.person_id)?.buildNotes.push({ id: n.id, ideaId: n.idea_id, sparkBy: spark.person_id, at: n.created_at });
  }
  for (const h of held) {
    const spark = ideas.get(h.idea_id);
    if (spark && h.person_id !== spark.person_id) out.get(spark.person_id)?.heldReceived.push({ id: h.id, ideaId: h.idea_id, by: h.person_id, at: h.created_at });
  }
  return out;
}
