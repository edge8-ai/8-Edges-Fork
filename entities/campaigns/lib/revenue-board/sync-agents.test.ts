import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The writer agent's cards on the Revenue board. Scripted in the order the
// pass asks: the campaigns, the cards already on the board, then its writes.
// What is pinned: the column each writer state lands in, the move to Waiting
// when the writer gets stuck, and that the card's description keeps every word
// a person typed while the sync adds and removes only its own note (R.22).

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const landed: { taskId: string; toColumnId: string; label: string }[] = [];
vi.mock("@/entities/boards", () => ({
  selectTasks: (cols: string) => builderFor("tasks").select(cols),
  insertTasks: (row: unknown) => builderFor("tasks").insert(row),
  updateTasks: (patch: Record<string, unknown>) => builderFor("tasks").update(patch),
  endPosition: async () => 1,
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
  ...over,
});
const writerCard = (over: Record<string, unknown> = {}) => ({
  id: "card-1",
  status: "open",
  archived_at: null,
  subject_id: "c1",
  description: null,
  metadata: { source: "agent", agent_state: "working", writer_error: null },
  ...over,
});
const inserts = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "insert").map((c) => c.payloads[0] as Record<string, unknown>);
const updates = () => calls.filter((c) => c.table === "tasks" && c.ops[0] === "update").map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  landed.length = 0;
});

describe("the writer's cards on the Revenue board", () => {
  it("files each campaign in the column that says where the writer is", async () => {
    script("marketing_campaigns", {
      data: [
        campaign("queued"),
        campaign("working", { writer_step: "drafting" }),
        campaign("stuck", { writer_step: "drafting", writer_error: "No brand voice." }),
        campaign("done", { status: "done" }),
        campaign("dropped", { status: "archived" }),
      ],
    });
    script("tasks", { data: [] }, { error: null }, { error: null }, { error: null }, { error: null }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 5, moved: 0, errors: [] });
    const byCampaign = Object.fromEntries(inserts().map((row) => [row.subject_id, row]));
    expect(byCampaign.queued).toMatchObject({ board_column_id: "col-todo", status: "open", assignee_id: null, description: null });
    expect(byCampaign.working).toMatchObject({ board_column_id: "col-doing", status: "open" });
    expect(byCampaign.stuck).toMatchObject({
      board_column_id: "col-waiting",
      status: "open",
      priority: "p1",
      assignee_id: "thao",
      description: "The writer stopped: No brand voice.",
      metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." },
    });
    expect(byCampaign.done).toMatchObject({ board_column_id: "col-done", status: "done", completed_at: "2026-09-23T10:00:00Z" });
    expect(byCampaign.dropped).toMatchObject({ board_column_id: "col-nd", status: "not_doing" });
  });

  it("moves the card to Waiting for the board's owner when the writer gets stuck", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting", writer_error: "No brand voice." })] });
    script("tasks", { data: [writerCard()] }, { error: null });

    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 1, errors: [] });
    expect(landed).toEqual([{ taskId: "card-1", toColumnId: "col-waiting", label: "content sync" }]);
    expect(updates()).toEqual([
      {
        metadata: { source: "agent", agent_state: "stuck", writer_error: "No brand voice." },
        description: "The writer stopped: No brand voice.",
        priority: "p1",
        assignee_id: "thao",
      },
    ]);
  });

  it("leaves a card alone while the writer's state has not changed, so a person's drag stands", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
    script("tasks", { data: [writerCard({ description: "Moved to Doing by hand." })] });
    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, errors: [] });
    expect(landed).toEqual([]);
    expect(updates()).toEqual([]);
  });

  it("does not count a card another run filed a moment ago as an error", async () => {
    const duplicate = { message: "duplicate key value violates unique constraint", code: "23505" };
    script("marketing_campaigns", { data: [campaign("c1")] });
    script("tasks", { data: [] }, { error: duplicate });
    const r = await syncAgentCards(BOARD, "2026-09-24");
    expect(r).toEqual({ created: 0, moved: 0, errors: [] });
  });
});

describe("a writer card's description", () => {
  it("keeps what a person typed when the writer gets stuck, and adds its note after it", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting", writer_error: "No brand voice." })] });
    script("tasks", { data: [writerCard({ description: "Ask Dave which voice to use." })] }, { error: null });
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBe("Ask Dave which voice to use.\n\nThe writer stopped: No brand voice.");
  });

  it("takes only its own note off when the writer recovers, and keeps the person's words", async () => {
    script("marketing_campaigns", { data: [campaign("c1", { writer_step: "drafting" })] });
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
    script("tasks", { data: [writerCard({ description: "The writer stopped: No brand voice.", metadata: { source: "agent", agent_state: "stuck" } })] }, { error: null });
    await syncAgentCards(BOARD, "2026-09-24");
    expect(updates()[0].description).toBeNull();
  });
});
