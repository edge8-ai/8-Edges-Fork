import { beforeEach, describe, expect, it, vi } from "vitest";

// W.118.6. A learning's source links are drawn as hrefs on the idea page, so
// each is stored as externalHref writes it or the learning is refused.
const inserts: Record<string, unknown>[] = [];
const updates: { id: string; patch: Record<string, unknown> }[] = [];
const generated: string[] = [];
// What teamRead's .eq().maybeSingle() answers for an ownership check.
let readAnswer: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: vi.fn(async () => ({ email: "member@example.test", personId: "p1", name: "Rowan" })) }));
// What getSharedIdea answers for the spark being reacted to or built on.
let sharedIdea: Record<string, unknown> | null = null;
const reactionsSet: unknown[][] = [];
const buildsAdded: unknown[][] = [];
vi.mock("@/entities/team/lib/data", () => ({
  getSharedIdea: vi.fn(async () => sharedIdea),
  teamRead: vi.fn(() => ({ eq: () => ({ maybeSingle: async () => readAnswer }) })),
  teamUpdateInScope: vi.fn(async (_actor: unknown, _table: string, id: string, patch: Record<string, unknown>) => {
    updates.push({ id, patch });
    return { ok: true, error: null };
  }),
  teamInsertOwn: vi.fn(async (_actor: unknown, _table: string, row: Record<string, unknown>) => {
    inserts.push(row);
    return { data: { id: "i1" }, error: null };
  }),
}));
// The Workboard side of a pick-up, and the bus.
let ideaCards: { status: string }[] = [];
const cardsMade: Record<string, unknown>[] = [];
// What createCard and setCardSprint answer; a test overrides one to fail.
let madeAnswer: { ok: boolean; id?: string; error?: string } = { ok: true, id: "t1" };
let sprintAnswer: { ok: true } | { ok: false; error: string } = { ok: true };
const sprintsSet: unknown[][] = [];
const published: [string, Record<string, unknown>][] = [];
let liveReactions: Record<string, unknown>[] = [];
const checkIns: unknown[][] = [];
vi.mock("@/entities/boards", () => ({
  cardsForIdeas: vi.fn(async () => ideaCards),
  pickableBoards: vi.fn(async () => [{ id: "bd1", slug: "ops", name: "Ops", columnId: "col1", sprintId: "sp6" }]),
  createCard: vi.fn(async (input: Record<string, unknown>) => {
    cardsMade.push(input);
    return madeAnswer;
  }),
  setCardSprint: vi.fn(async (...args: unknown[]) => {
    sprintsSet.push(args);
    return sprintAnswer;
  }),
}));
vi.mock("@/kernel/events", () => ({ publish: vi.fn(async (name: string, payload: Record<string, unknown>) => void published.push([name, payload])) }));
// The origin the card description is built on (W.185); the real helper reads request headers.
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://team.example.test" }));
vi.mock("@/entities/ideas", () => ({
  readSparkSignals: vi.fn(async () => ({ reactions: liveReactions, builds: [] })),
  answerSparkCheckIn: vi.fn(async (...args: unknown[]) => {
    checkIns.push(args);
    return { ok: true };
  }),
  generateIdeaPlan: vi.fn(async (id: string) => void generated.push(id)),
  setSparkReaction: vi.fn(async (...args: unknown[]) => {
    reactionsSet.push(args);
    return { ok: true };
  }),
  addSparkBuild: vi.fn(async (...args: unknown[]) => {
    buildsAdded.push(args);
    return { ok: true, id: "b1" };
  }),
}));

import { addSparkStory, answerCheckIn, buildOnSpark, pickUpSpark, quickSpark, reactToSpark, submitIdea, submitLearning } from "./actions";

const learning = (sourceUrls: string[]) => ({ title: "A lesson", story: "What happened.", takeaway: "Do it differently.", sourceUrls });
const fiveD = { title: "Talent pool searcher", problem: "P", data_needed: "D", workflow: "W", roi: "R" };
const mine = (over: Record<string, unknown> = {}) => ({ data: { id: "s1", person_id: "p1", kind: "build", title: "One line", ai_plan: null, ...over }, error: null });

beforeEach(() => {
  asked.length = 0;
  inserts.length = 0;
  updates.length = 0;
  generated.length = 0;
  readAnswer = { data: null, error: null };
  sharedIdea = null;
  reactionsSet.length = 0;
  buildsAdded.length = 0;
  ideaCards = [];
  cardsMade.length = 0;
  madeAnswer = { ok: true, id: "t1" };
  sprintAnswer = { ok: true };
  sprintsSet.length = 0;
  published.length = 0;
  liveReactions = [];
  checkIns.length = 0;
});

describe("submitLearning · source links", () => {
  it("stores each link as externalHref writes it, schemeless ones as https", async () => {
    expect(await submitLearning(learning(["https://example.com/a", "example.org/b"]))).toEqual({ ok: true, id: "i1" });
    expect(inserts[0].source_urls).toEqual(["https://example.com/a", "https://example.org/b"]);
    expect(asked).toEqual(["team.ideas"]);
  });

  it("refuses the learning when a link is not a web link, and writes nothing", async () => {
    expect(await submitLearning(learning(["https://example.com/a", "javascript:alert(1)"]))).toEqual({
      ok: false,
      error: '"javascript:alert(1)" needs to be a regular http(s) link.',
    });
    expect(inserts).toHaveLength(0);
  });
});

describe("quickSpark · one line is a whole spark (ID.2.1)", () => {
  it("files the line under its kind, asks the page's permission, and calls no model", async () => {
    expect(await quickSpark({ kind: "learning", title: "  Price the   result, not the hours  " })).toEqual({ ok: true, id: "i1" });
    expect(inserts[0]).toEqual({ kind: "learning", title: "Price the result, not the hours" });
    expect(asked).toEqual(["team.ideas"]);
    expect(generated).toEqual([]);
  });

  it("treats any other kind as an idea to build", async () => {
    await quickSpark({ kind: "admin", title: "A line" });
    expect(inserts[0].kind).toBe("build");
  });

  it("refuses an empty line and a paragraph, writing nothing", async () => {
    expect((await quickSpark({ kind: "build", title: "   " })).ok).toBe(false);
    expect((await quickSpark({ kind: "build", title: "x".repeat(201) })).ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe("addSparkStory · the optional second line", () => {
  it("keeps a learning's story with its spark line as the takeaway, then polishes it", async () => {
    readAnswer = mine({ kind: "learning", title: "Lock the stills first" });
    expect(await addSparkStory("s1", "Fixing a frame is cheap.")).toEqual({ ok: true });
    expect(updates).toEqual([{ id: "s1", patch: { story: "Fixing a frame is cheap.", takeaway: "Lock the stills first" } }]);
    expect(generated).toEqual(["s1"]);
  });

  it("keeps an idea's story as the problem it defines, with no plan yet", async () => {
    readAnswer = mine();
    await addSparkStory("s1", "Cards hide their comments.");
    expect(updates[0].patch).toEqual({ problem: "Cards hide their comments." });
    expect(generated).toEqual([]);
  });

  it("refuses someone else's spark, and says a failed read is a failure, not a refusal", async () => {
    readAnswer = mine({ person_id: "p2" });
    expect(await addSparkStory("s1", "x")).toEqual({ ok: false, error: "Only the person who shared this spark can change it." });
    readAnswer = { data: null, error: { message: "timeout" } };
    expect(await addSparkStory("s1", "x")).toEqual({ ok: false, error: "Could not load that spark. Try again in a moment." });
    expect(updates).toHaveLength(0);
  });
});

describe("submitIdea · growing a spark into a 5D plan", () => {
  it("fills in the person's own spark instead of filing a second copy", async () => {
    readAnswer = mine();
    expect(await submitIdea(fiveD, "s1")).toEqual({ ok: true, id: "s1" });
    expect(inserts).toHaveLength(0);
    expect(updates[0]).toEqual({ id: "s1", patch: { title: "Talent pool searcher", problem: "P", data_needed: "D", workflow: "W", roi: "R" } });
    expect(generated).toEqual(["s1"]);
  });

  it("refuses a learning, a spark that already has a plan, and someone else's spark", async () => {
    readAnswer = mine({ kind: "learning" });
    expect((await submitIdea(fiveD, "s1")).ok).toBe(false);
    readAnswer = mine({ ai_plan: "## Plan" });
    expect((await submitIdea(fiveD, "s1")).ok).toBe(false);
    readAnswer = mine({ person_id: "p2" });
    expect((await submitIdea(fiveD, "s1")).ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("still files a new idea without a sparkId", async () => {
    expect(await submitIdea(fiveD)).toEqual({ ok: true, id: "i1" });
    expect(inserts).toHaveLength(1);
  });
});

describe("reactToSpark · one-tap answers (ID.2.6)", () => {
  const theirs = { id: "s9", person_id: "p2", status: "new", title: "Card faces show comments" };

  it("saves admire, me-too and skip on a teammate's spark, as the actor, asking the page's permission", async () => {
    sharedIdea = theirs;
    for (const kind of ["admire", "me_too", "skip"]) expect(await reactToSpark("s9", kind)).toEqual({ ok: true });
    expect(reactionsSet).toEqual([
      ["p1", "s9", "admire", true],
      ["p1", "s9", "me_too", true],
      ["p1", "s9", "skip", true],
    ]);
    expect(asked.every((p) => p === "team.ideas")).toBe(true);
  });

  it("withdraws when asked to turn one off", async () => {
    sharedIdea = theirs;
    await reactToSpark("s9", "admire", false);
    expect(reactionsSet[0]).toEqual(["p1", "s9", "admire", false]);
  });

  it("refuses a vote, the person's own spark, and a spark that is gone, saving nothing", async () => {
    sharedIdea = theirs;
    expect((await reactToSpark("s9", "vote")).ok).toBe(false);
    sharedIdea = { ...theirs, person_id: "p1" };
    expect(await reactToSpark("s9", "admire")).toEqual({ ok: false, error: "That's your own spark." });
    sharedIdea = { ...theirs, status: "archived" };
    expect((await reactToSpark("s9", "admire")).ok).toBe(false);
    sharedIdea = null;
    expect((await reactToSpark("s9", "admire")).ok).toBe(false);
    expect(reactionsSet).toHaveLength(0);
  });
});

describe("buildOnSpark · a line of your own (ID.2.7)", () => {
  it("posts the build as the actor, by name, on any live spark, the author's own included", async () => {
    sharedIdea = { id: "s9", person_id: "p1", status: "new", title: "Mine" };
    expect(await buildOnSpark("s9", "Adding a case.")).toEqual({ ok: true, id: "b1" });
    expect(buildsAdded[0]).toEqual([{ personId: "p1", name: "Rowan" }, sharedIdea, "Adding a case."]);
  });

  it("refuses a spark that is gone", async () => {
    sharedIdea = { id: "s9", person_id: "p2", status: "archived", title: "Old" };
    expect((await buildOnSpark("s9", "x")).ok).toBe(false);
    expect(buildsAdded).toHaveLength(0);
  });
});

describe("pickUpSpark · a spark becomes a Workboard card (ID.2.8)", () => {
  const theirs = { id: "s9", person_id: "p2", kind: "build", status: "new", title: "Card faces show comments", submitterName: "Derek", ai_plan: null, takeaway: null, problem: "Cards hide comments.", story: null };

  it("makes the card through the board's own createCard, linked to the spark, and tells the author", async () => {
    sharedIdea = theirs;
    expect(await pickUpSpark("s9", "bd1")).toEqual({ ok: true, taskId: "t1" });
    expect(cardsMade[0]).toMatchObject({ boardId: "bd1", columnId: "col1", title: "Card faces show comments", assigneeId: "p1", ideaId: "s9" });
    expect(String(cardsMade[0].description)).toContain("https://team.example.test/team/ideas/s9");
    expect(published).toEqual([["idea.picked_up", { ideaId: "s9", taskId: "t1", boardSlug: "ops", actorName: "Rowan", title: "Card faces show comments", assigneeId: "p2", actorPersonId: "p1" }]]);
  });

  it("refuses a learning, a spark already picked up, and a board the person may not use", async () => {
    sharedIdea = { ...theirs, kind: "learning" };
    expect((await pickUpSpark("s9", "bd1")).ok).toBe(false);
    sharedIdea = theirs;
    ideaCards = [{ status: "open" }];
    expect((await pickUpSpark("s9", "bd1")).ok).toBe(false);
    ideaCards = [];
    expect(await pickUpSpark("s9", "bd-elsewhere")).toEqual({ ok: false, error: "Pick a board you can add cards to." });
    expect(cardsMade).toHaveLength(0);
    expect(published).toHaveLength(0);
  });

  // W.184: the cards Khoa picked up on 8 Oct were P3 and in no sprint, so the
  // board's This sprint group never showed them.
  it("makes the card P2 and puts it in the board's current sprint", async () => {
    sharedIdea = theirs;
    expect(await pickUpSpark("s9", "bd1")).toEqual({ ok: true, taskId: "t1" });
    expect(cardsMade[0]).toMatchObject({ priority: "p2" });
    expect(sprintsSet).toEqual([["t1", "sp6", "ops"]]);
  });

  it("still counts the pick-up, and says what fell short, when the card exists but a later step failed", async () => {
    sharedIdea = theirs;
    sprintAnswer = { ok: false, error: "That sprint is locked for planning." };
    expect(await pickUpSpark("s9", "bd1")).toEqual({
      ok: false,
      error: "Picked up, and the card is on the board. It could not join the sprint: That sprint is locked for planning.",
    });
    expect(published.map(([name]) => name)).toEqual(["idea.picked_up"]);

    published.length = 0;
    sprintAnswer = { ok: true };
    madeAnswer = { ok: false, id: "t1", error: "Card created, but its stage history could not be written: down" };
    expect((await pickUpSpark("s9", "bd1")).ok).toBe(false);
    expect(published.map(([name]) => name)).toEqual(["idea.picked_up"]);

    published.length = 0;
    madeAnswer = { ok: false, error: "That column is not on this board." };
    expect(await pickUpSpark("s9", "bd1")).toEqual({ ok: false, error: "That column is not on this board." });
    expect(published).toHaveLength(0);
  });

  it("lets a card that was set aside be picked up again", async () => {
    sharedIdea = theirs;
    ideaCards = [{ status: "not_doing" }];
    expect((await pickUpSpark("s9", "bd1")).ok).toBe(true);
  });
});

describe("answerCheckIn · did it hold? (ID.2.9)", () => {
  const learning = { id: "l1", person_id: "p2", kind: "learning", status: "new", title: "Lock the stills" };

  it("saves the person's own answer on a learning they said they'd try", async () => {
    sharedIdea = learning;
    liveReactions = [{ ideaId: "l1", personId: "p1", kind: "me_too" }];
    expect(await answerCheckIn("l1", "held")).toEqual({ ok: true });
    expect(checkIns).toEqual([["p1", "l1", "held"]]);
  });

  it("refuses an answer it doesn't know, an idea to build, and a learning never tried", async () => {
    sharedIdea = learning;
    liveReactions = [{ ideaId: "l1", personId: "p1", kind: "me_too" }];
    expect((await answerCheckIn("l1", "maybe")).ok).toBe(false);
    sharedIdea = { ...learning, kind: "build" };
    expect((await answerCheckIn("l1", "held")).ok).toBe(false);
    sharedIdea = learning;
    liveReactions = [{ ideaId: "l1", personId: "p9", kind: "me_too" }];
    expect((await answerCheckIn("l1", "held")).ok).toBe(false);
    expect(checkIns).toHaveLength(0);
  });
});
