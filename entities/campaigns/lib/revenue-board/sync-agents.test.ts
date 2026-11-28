import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerOnlySelectedColumns, builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A card per campaign on the Revenue board. Each table answers from its own
// script: the campaigns, their posts, the cards already on the board, then the
// pass's writes. What is pinned: a card for every campaign from the hour it is
// made, titled with its name and due on its publish date; the column its posts
// put it in (Done once every post is out); the move to Waiting when the writer
// gets stuck; and that the card keeps every word and title a person typed while
// the sync changes only what it wrote itself (R.22).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const landed: { taskId: string; toColumnId: string; label: string }[] = [];
const births: { card: Record<string, unknown>; completedAt?: string }[] = [];
vi.mock("@/entities/boards", async () => ({
  // boards' real question and the sync's edit command (card-lookups.test.ts
  // pins their queries), on the fake client.
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/card-lookups")),
  ...(await vi.importActual<Record<string, unknown>>("@/entities/boards/lib/sync-edits")),
  // bearCard's own contract (status, position, create row, events) is tested
  // beside it (A.53); here the birth is the insert it makes, scripted on tasks.
  bearCard: async (b: { card: Record<string, unknown>; completedAt?: string }) => {
    births.push(b);
    const { data, error } = await builderFor("tasks").insert(b.card).select("id").single();
    if (error) return { ok: false, error: error.message, ...((error as { code?: string }).code ? { code: (error as { code?: string }).code } : {}) };
    return { ok: true, id: (data as { id?: string } | null)?.id ?? "new-card" };
  },
  bearSubtasks: (row: unknown) => builderFor("tasks").insert(row),
  dayLabel: () => "Thu 24 Sep",
  landCardAsSystem: async (m: { taskId: string; toColumnId: string; label: string }) => {
    landed.push(m);
    return { ok: true };
  },
}));

const { syncAgentCards } = await import("./sync-agents");

const BOARD = {
  id: "board-1",
  slug: "revenue",
  ownerId: "thao",
  epicId: "epic-1",
  columns: { todo: "col-todo", doing: "col-doing", waiting: "col-waiting", done: "col-done", notDoing: "col-nd" },
};
const campaign = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Campaign ${id}`,
  status: "active",
  starts_on: "2026-09-24",
  writer_step: null,
  writer_error: null,
  updated_at: "2026-09-23T10:00:00Z",
  idea: "An idea.",
  objective: null,
  brands: null,
  ...over,
});
const writerCard = (over: Record<string, unknown> = {}) => ({
  id: "card-1",
  title: "Campaign c1",
  due_date: "2026-09-24",
  status: "open",
  archived_at: null,
  subject_id: "c1",
  description: null,
  metadata: { source: "agent", agent_state: "working", writer_error: null, campaign_title: "Campaign c1", campaign_due: "2026-09-24" },
  ...over,
});
const posts = (campaignId: string, ...statuses: string[]) => statuses.map((status) => ({ campaign_id: campaignId, status }));
const RECORDED = { campaign_title: "Campaign c1", campaign_due: "2026-09-24" };
const inserts = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);
const updates = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  landed.length = 0;
  births.length = 0;
});

describe("the campaigns' cards on the Revenue board", () => {
  it("files each campaign in the column its posts and its writer put it in", async () => {
    script("marketing_campaigns", {
      data: [
        campaign("queued"),
        campaign("working", { writer_step: "drafting" }),
        campaign("stuck", { writer_step: "drafting", writer_error: "No brand voice." }),
        campaign("drafted", { status: "done" }),
        campaign("out", { status: "done" }),
        campaign("dropped", { status: "archived" }),
      ],
    });
    script("marketing_content", { data: [...posts("drafted", "approved", "published"), ...posts("out", "published", "skipped")] });
    script("tasks", { data: [] }, { error: null }, { error: null }, { error: null }, { error: null }, { error: null }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 6, moved: 0, refreshed: 0, errors: [] });
    const byCampaign = Object.fromEntries(inserts().map((row) => [row.subject_id, row]));
    // The column says what the card is: bearCard sets the status from it.
    expect(byCampaign.queued).toMatchObject({ board_column_id: "col-todo", assignee_id: null });
    expect(byCampaign.working).toMatchObject({ board_column_id: "col-doing" });
    expect(byCampaign.stuck).toMatchObject({
      board_column_id: "col-waiting",
      priority: "p1",
      assignee_id: "thao",
      metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." },
    });
    // The writer finished drafting, but a post is still to go out: Doing, not Done.
    expect(byCampaign.drafted).toMatchObject({ board_column_id: "col-doing" });
    expect(byCampaign.out).toMatchObject({ board_column_id: "col-done" });
    // A finished campaign is dated by when it finished, not by this pass.
    expect(births.find((b) => b.card.subject_id === "out")?.completedAt).toBe("2026-09-23T10:00:00Z");
    expect(byCampaign.dropped).toMatchObject({ board_column_id: "col-nd" });
  });

  it("titles the card with the campaign's name, due on its publish date, with its details", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { objective: "Book 3 demos", brands: { name: "Edge8" } })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [] }, { error: null });

    await syncAgentCards(BOARD, "2026-09-24");
    expect(inserts()[0]).toMatchObject({
      title: "Campaign c1",
      due_date: "2026-09-24",
      metadata: { campaign_title: "Campaign c1", campaign_due: "2026-09-24" },
    });
    expect(inserts()[0].description).toMatch(/^Publishes Thu 24 Sep\nBrand: Edge8\nObjective: Book 3 demos\nIdea: An idea\.\nCampaign: .*\/admin\/revenue\/marketing\/campaigns\/c1\/$/);
  });

  it("puts the writer's note after the details on a campaign born stuck", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting", writer_error: "No brand voice." })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [] }, { error: null });

    await syncAgentCards(BOARD, "2026-09-24");
    expect(inserts()[0].description).toMatch(/\/c1\/\n\nThe writer stopped: No brand voice\.$/);
  });

  it("asks for every campaign from the past week on, however far off it publishes, and new ones with no date yet", async () => {
    script("marketing_campaigns", { data: [] });
    await syncAgentCards(BOARD, "2026-09-24");
    const read = calls.find((c) => c.table === "marketing_campaigns");
    expect(read?.filters).toContainEqual(["or", "starts_on.gte.2026-09-17,and(starts_on.is.null,created_at.gte.2026-09-17)"]);
    expect(read?.filters.some((f) => f[0] === "lte")).toBe(false);
  });

  it("moves the card to Waiting for the board's owner when the writer gets stuck", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting", writer_error: "No brand voice." })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard()] }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 1, refreshed: 0, errors: [] });
    expect(landed).toEqual([{ taskId: "card-1", toColumnId: "col-waiting", label: "content sync" }]);
    expect(updates()).toEqual([
      {
        metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice.", ...RECORDED },
        description: "The writer stopped: No brand voice.",
        priority: "p1",
        assignee_id: "thao",
      },
    ]);
  });

  it("brings a card back from Done when the writer finished but the posts are not all out", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { status: "done" })] });
    script("marketing_content", { data: posts("c1", "published", "approved") });
    script("tasks", { data: [writerCard({ status: "done", metadata: { source: "agent", agent_state: "done", writer_error: null, ...RECORDED } })] }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toMatchObject({ moved: 1, errors: [] });
    expect(landed).toEqual([{ taskId: "card-1", toColumnId: "col-doing", label: "content sync" }]);
  });

  it("closes the card once the campaign's last post is out", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { status: "done" })] });
    script("marketing_content", { data: posts("c1", "published", "published") });
    script("tasks", { data: [writerCard()] }, { error: null });

    await syncAgentCards(BOARD, "2026-09-24");
    expect(landed).toEqual([{ taskId: "card-1", toColumnId: "col-done", label: "content sync" }]);
  });

  it("leaves a card alone while nothing about its campaign changed, so a person's drag stands", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard({ description: "Moved to Doing by hand." })] });
    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, refreshed: 0, errors: [] });
    expect(landed).toEqual([]);
    expect(updates()).toEqual([]);
  });

  it("does not count a card another run filed a moment ago as an error", async () => {
    const duplicate = { message: "duplicate key value violates unique constraint", code: "23505" };
    script("marketing_campaigns", { data: [campaign("c1")] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [] }, { error: duplicate });
    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, refreshed: 0, errors: [] });
  });

  it("says so, and files nothing, when the campaigns' posts cannot be read", async () => {
    script("marketing_campaigns", { data: [campaign("c1")] });
    script("marketing_content", { error: { message: "content unavailable" } });
    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r.errors).toEqual(["campaign posts: content unavailable"]);
    expect(inserts()).toEqual([]);
  });
});

describe("a campaign card's title and deadline", () => {
  it("renames a card the writer sync titled before, and records what it wrote", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard({ title: "Writer: Campaign c1", metadata: { source: "agent", agent_state: "working", writer_error: null } })] }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, refreshed: 1, errors: [] });
    expect(updates()).toEqual([
      { title: "Campaign c1", metadata: { source: "agent", agent_state: "working", writer_error: null, campaign_title: "Campaign c1", campaign_due: "2026-09-24" } },
    ]);
  });

  it("follows the campaign when it is renamed or re-dated", async () => {
    // As PostgREST answers: the card's title and deadline come back only if
    // the board's lookup asks for them, so a lookup that drops one fails here.
    answerOnlySelectedColumns();
    script("marketing_campaigns", { data: [campaign("c1", { name: "A better name", starts_on: "2026-09-30", writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard()] }, { error: null });

    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0]).toMatchObject({ title: "A better name", due_date: "2026-09-30", metadata: { campaign_title: "A better name", campaign_due: "2026-09-30" } });
  });

  it("never overwrites a title or a deadline a person set", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { name: "A better name", starts_on: "2026-09-30", writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard({ title: "Launch week", due_date: "2026-09-26" })] });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, refreshed: 0, errors: [] });
    expect(updates()).toEqual([]);
  });
});

describe("a writer card's description", () => {
  it("keeps what a person typed when the writer gets stuck, and adds its note after it", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting", writer_error: "No brand voice." })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard({ description: "Ask Dave which voice to use." })] }, { error: null });
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBe("Ask Dave which voice to use.\n\nThe writer stopped: No brand voice.");
  });

  it("takes only its own note off when the writer recovers, and keeps the person's words", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script(
      "tasks",
      {
        data: [
          writerCard({
            description: "Ask Dave which voice to use.\n\nThe writer stopped: No brand voice.",
            metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." },
          }),
        ],
      },
      { error: null },
    );
    await syncAgentCards(BOARD, "2026-09-24");
    expect(landed).toEqual([{ taskId: "card-1", toColumnId: "col-doing", label: "content sync" }]);
    expect(updates()[0]).toMatchObject({ description: "Ask Dave which voice to use.", priority: "p3", metadata: { agent_state: "working", writer_error: null } });
    expect(updates()[0]).not.toHaveProperty("assignee_id");
  });

  it("empties a description that was only its note once the writer recovers", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { status: "done" })] });
    script("marketing_content", { data: [] });
    script(
      "tasks",
      { data: [writerCard({ description: "The writer stopped: No brand voice.", metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." } })] },
      { error: null },
    );
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBeNull();
  });

  it("leaves a note a person edited, because it has become theirs", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script(
      "tasks",
      {
        data: [
          writerCard({
            description: "The writer stopped: No brand voice. Fixed the voice, rerunning.",
            metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." },
          }),
        ],
      },
      { error: null },
    );
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBe("The writer stopped: No brand voice. Fixed the voice, rerunning.");
  });

  it("clears the note on a card filed before the sync recorded its error", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("marketing_content", { data: [] });
    script("tasks", { data: [writerCard({ description: "The writer stopped: No brand voice.", metadata: { source: "agent", agent_state: "stuck" } })] }, { error: null });
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBeNull();
  });
});
