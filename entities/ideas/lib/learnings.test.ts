import { beforeEach, describe, expect, it, vi } from "vitest";

// The learnings another page reads and answers (QS.4). The count is of
// distinct people other than the author, and Will try is refused on a
// learning that is the person's own, gone, or not a learning at all.
const idea = vi.hoisted(() => ({ row: null as null | Record<string, string>, error: null as null | { message: string } }));
const setSparkReaction = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
const postSpark = vi.hoisted(() => vi.fn(async () => ({ data: { id: "new" }, error: null })));

// A list read (learningOf) answers with the table's scripted rows; a one-row read (sayWillTry) with idea.row.
const lists = vi.hoisted(() => ({ ideas: { data: [] as unknown[], error: null as null | { message: string } }, idea_reactions: { data: [] as unknown[], error: null as null | { message: string } } }));
vi.mock("@/kernel/data/supabase", () => {
  const chainOf = (table: keyof typeof lists) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      is: () => chain,
      in: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: idea.row, error: idea.error }),
      then: (done: (r: unknown) => unknown) => done(lists[table]),
    };
    return chain;
  };
  return { companyOs: { from: (table: keyof typeof lists) => chainOf(table) } };
});
vi.mock("./spark-store", () => ({ setSparkReaction, postSpark }));

const { learningOf, postLearning, sayWillTry, shapeLearnings } = await import("./learnings");

const row = (id: string, author: string) => ({ id, person_id: author, title: `Learning ${id}`, created_at: "2026-10-21T01:00:00Z", people: { display_name: `Member ${author}` } });

describe("shapeLearnings", () => {
  it("counts distinct people other than the author, and says whether the reader is one", () => {
    const [l] = shapeLearnings(
      [row("l1", "a")],
      [
        { idea_id: "l1", person_id: "b" },
        { idea_id: "l1", person_id: "b" },
        { idea_id: "l1", person_id: "c" },
        { idea_id: "l1", person_id: "a" },
      ],
      "c",
    );
    expect(l).toMatchObject({ id: "l1", authorId: "a", authorName: "Member a", willTry: 2, youWillTry: true });
  });

  it("never marks the author as trying their own learning", () => {
    const [l] = shapeLearnings([row("l1", "a")], [{ idea_id: "l1", person_id: "a" }], "a");
    expect(l).toMatchObject({ willTry: 0, youWillTry: false });
  });

  it("carries no names of the people who will try", () => {
    const [l] = shapeLearnings([row("l1", "a")], [{ idea_id: "l1", person_id: "b" }], "c");
    expect(JSON.stringify(l)).not.toContain('"b"');
  });
});

describe("sayWillTry", () => {
  beforeEach(() => {
    setSparkReaction.mockClear();
    idea.error = null;
  });

  it("writes Spark's me_too on someone else's learning", async () => {
    idea.row = { id: "l1", person_id: "a", kind: "learning", status: "new" };
    expect(await sayWillTry("b", "l1", true)).toEqual({ ok: true });
    expect(setSparkReaction).toHaveBeenCalledWith("b", "l1", "me_too", true);
  });

  it("refuses the author's own learning", async () => {
    idea.row = { id: "l1", person_id: "a", kind: "learning", status: "new" };
    expect(await sayWillTry("a", "l1", true)).toEqual({ ok: false, error: "That's your own learning." });
    expect(setSparkReaction).not.toHaveBeenCalled();
  });

  it("refuses an idea to build, an archived learning, and a failed read", async () => {
    idea.row = { id: "l1", person_id: "a", kind: "build", status: "new" };
    expect((await sayWillTry("b", "l1", true)).ok).toBe(false);
    idea.row = { id: "l1", person_id: "a", kind: "learning", status: "archived" };
    expect((await sayWillTry("b", "l1", true)).ok).toBe(false);
    idea.error = { message: "boom" };
    expect(await sayWillTry("b", "l1", true)).toEqual({ ok: false, error: "Could not read that learning. Try again in a moment." });
    expect(setSparkReaction).not.toHaveBeenCalled();
  });
});

describe("postLearning", () => {
  it("posts one cleaned line as a learning spark through the one spark insert", async () => {
    expect(await postLearning("a", "  Ask the client   first  ")).toEqual({ ok: true, id: "new" });
    expect(postSpark).toHaveBeenCalledWith("a", { kind: "learning", title: "Ask the client first" });
  });

  it("refuses an empty line and one over the spark length", async () => {
    postSpark.mockClear();
    expect((await postLearning("a", "   ")).ok).toBe(false);
    expect((await postLearning("a", "x".repeat(201))).ok).toBe(false);
    expect(postSpark).not.toHaveBeenCalled();
  });
});

describe("learningOf", () => {
  beforeEach(() => {
    lists.ideas = { data: [], error: null };
    lists.idea_reactions = { data: [], error: null };
  });

  it("reads one learning with its author and the distinct others who will try it, the author never among them", async () => {
    lists.ideas = { data: [row("l1", "a")], error: null };
    lists.idea_reactions = {
      data: [
        { idea_id: "l1", person_id: "b" },
        { idea_id: "l1", person_id: "b" },
        { idea_id: "l1", person_id: "c" },
        { idea_id: "l1", person_id: "a" },
      ],
      error: null,
    };
    expect(await learningOf("l1")).toMatchObject({ id: "l1", authorId: "a", title: "Learning l1", willTry: 2, youWillTry: false });
  });

  it("answers null for an idea that is not a learning the Lore draws", async () => {
    expect(await learningOf("gone")).toBeNull();
  });

  it("raises on a failed read rather than answering that nobody will try it", async () => {
    lists.ideas = { data: [row("l1", "a")], error: null };
    lists.idea_reactions = { data: [], error: { message: "down" } };
    await expect(learningOf("l1")).rejects.toThrow();
  });
});
