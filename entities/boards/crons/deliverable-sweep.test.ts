import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls } from "@/kernel/data/testing/fake-company-os";

// W.157: the card-attachments sweep. Scripted in the order it asks: stale
// unconfirmed uploads (read, delete), archived file deliverables (read,
// delete), the bucket's card folders and the cards behind them, each gone
// card's objects, then a window of live cards' folders for stray objects.
// The routine wrapper is faked to call straight in.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const { GET } = await import("./deliverable-sweep");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/deliverable-sweep/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const DAY = 24 * 60 * 60 * 1000;
const deletes = () => calls.filter((c) => c.table === "task_attachments" && c.ops[0] === "delete");
const removes = () => storageCalls.filter((c) => c.op === "remove").map((c) => c.args[0]);
const listed = () => storageCalls.filter((c) => c.op === "list");
const CARD = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";
const card = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
/** A stored object as list() describes it, created `days` ago. */
const obj = (name: string, days: number) => ({ name, id: `obj-${name}`, created_at: new Date(Date.now() - days * DAY).toISOString() });
/** The two row passes, with nothing to do. */
const noRows = () => script("task_attachments", { data: [] }, { data: [] });

beforeEach(() => resetFake());
afterEach(() => vi.useRealTimers());

describe("the deliverable sweep (W.157)", () => {
  it("removes stale uploads and long-archived file deliverables, objects first, then their rows", async () => {
    script("task_attachments", { data: [{ id: "u1", storage_path: `task/${CARD}/u1-a.png` }] }, { data: [{ id: "u1" }] });
    script("task_attachments", { data: [{ id: "a1", storage_path: `task/${CARD}/a1-b.pdf` }] }, { data: [{ id: "a1" }] });
    scriptStorage("remove", { data: [] }, { data: [] });
    scriptStorage("list", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ unconfirmed: 1, archived: 1, orphanedObjects: 0, strayObjects: 0, failed: [] });
    expect(removes()).toEqual([[`task/${CARD}/u1-a.png`], [`task/${CARD}/a1-b.pdf`]]);
    // The two reads are bounded by age: a day unconfirmed, thirty days archived.
    const reads = calls.filter((c) => c.table === "task_attachments" && c.ops[0] === "select");
    expect(reads[0].filters).toEqual(expect.arrayContaining([["is", "confirmed_at", null]]));
    expect(reads[1].filters).toEqual(expect.arrayContaining([["not", "archived_at", "is", null]]));
  });

  // Review of W.163: the rows of a 1000-path storage batch went to one
  // `.in()` delete, a request too long to send; they go in slices of 100.
  it("deletes a large purge's rows in short slices, one storage remove for their objects", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ id: `u${i}`, storage_path: `task/${CARD}/u${i}-a.png` }));
    script("task_attachments", { data: rows }, { data: rows.slice(0, 100).map((r) => ({ id: r.id })) }, { data: rows.slice(100).map((r) => ({ id: r.id })) });
    script("task_attachments", { data: [] });
    scriptStorage("remove", { data: [] });
    scriptStorage("list", { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ unconfirmed: 150, failed: [] });
    expect(removes()).toHaveLength(1);
    const sizes = deletes().map((d) => (d.filters.find((f) => f[0] === "in")?.[2] as string[]).length);
    expect(sizes).toEqual([100, 50]);
  });

  // Bug hunt B9 (W.163): archived LINK rows were deleted too, losing the
  // card's link history; a link has no object to purge.
  it("purges only archived FILE deliverables and keeps archived links", async () => {
    noRows();
    scriptStorage("list", { data: [] });
    await run();
    const archivedRead = calls.filter((c) => c.table === "task_attachments" && c.ops[0] === "select")[1];
    expect(archivedRead.filters).toEqual(expect.arrayContaining([["eq", "kind", "file"]]));
  });

  // Bug hunt F5 (W.163): the delete went by id alone, so a row that changed
  // after it was read was deleted on a stale answer.
  it("deletes a row only while it still meets the condition it was selected by, and says when one did not", async () => {
    script("task_attachments", { data: [{ id: "u1", storage_path: `task/${CARD}/u1-a.png` }] }, { data: [{ id: "u1" }] });
    script("task_attachments", { data: [{ id: "a1", storage_path: `task/${CARD}/a1-b.pdf` }] }, { data: [] });
    scriptStorage("remove", { data: [] }, { data: [] });
    scriptStorage("list", { data: [] });
    const { status, body } = await run();
    const [unconfirmed, archived] = deletes().map((d) => d.filters);
    expect(unconfirmed).toEqual(
      expect.arrayContaining([["in", "id", ["u1"]], ["is", "confirmed_at", null], ["lt", "created_at", expect.any(String)]]),
    );
    expect(archived).toEqual(expect.arrayContaining([["in", "id", ["a1"]], ["eq", "kind", "file"], ["lt", "archived_at", expect.any(String)]]));
    expect(body).toMatchObject({ unconfirmed: 1, archived: 0, failed: ["archived rows: 1 changed after they were read and were kept"] });
    expect(status).toBe(500);
  });

  it("keeps a row whose object would not go, for the next night, and reports the run as failed", async () => {
    script("task_attachments", { data: [{ id: "u1", storage_path: `task/${CARD}/u1-a.png` }] });
    script("task_attachments", { data: [] });
    scriptStorage("remove", { error: { message: "storage down" } });
    scriptStorage("list", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.failed).toEqual(["unconfirmed objects: storage down"]);
    // The same line becomes a failure, so the run's error names the pass (Y.20).
    expect(body.error).toBe("unconfirmed objects at sweep: storage down");
    expect(deletes()).toHaveLength(0);
  });

  it("removes the objects of a card that no longer exists, and leaves a live card's own files alone", async () => {
    noRows();
    scriptStorage(
      "list",
      { data: [{ name: CARD, id: null }, { name: GONE, id: null }] },
      { data: [obj("x1-old.png", 40), obj("x2-new.pdf", 0)] },
      { data: [obj("k1-kept.png", 5)] },
    );
    script("tasks", { data: [{ id: CARD }] });
    script("task_attachments", { data: [{ storage_path: `task/${CARD}/k1-kept.png` }] });
    scriptStorage("remove", { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ orphanedObjects: 2, strayObjects: 0, folders: 2, foldersChecked: 1, failed: [] });
    expect(removes()).toEqual([[`task/${GONE}/x1-old.png`, `task/${GONE}/x2-new.pdf`]]);
    expect(listed().map((c) => c.args[0])).toEqual(["task", `task/${GONE}`, `task/${CARD}`]);
  });

  // Bug hunt K1 (W.163): an object in a LIVE card's folder that no row names
  // (a reused upload token after a discard, or F1) was reached by no pass.
  it("removes a live card's objects that no row names once they are a day old, and nothing younger", async () => {
    noRows();
    scriptStorage(
      "list",
      { data: [{ name: CARD, id: null }] },
      { data: [obj("k1-kept.png", 3), obj("s1-stray.png", 2), obj("s2-fresh.png", 0.5)] },
    );
    script("tasks", { data: [{ id: CARD }] });
    script("task_attachments", { data: [{ storage_path: `task/${CARD}/k1-kept.png` }] });
    scriptStorage("remove", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ orphanedObjects: 0, strayObjects: 1 });
    expect(removes()).toEqual([[`task/${CARD}/s1-stray.png`]]);
    // Only the objects old enough to judge are looked up, by their exact path.
    const lookup = calls.filter((c) => c.table === "task_attachments" && c.ops[0] === "select")[2];
    expect(lookup.filters).toEqual([["in", "storage_path", [`task/${CARD}/k1-kept.png`, `task/${CARD}/s1-stray.png`]]]);
  });

  // Bug hunt F4 (W.163): folder names were compared byte for byte with the
  // lowercase card ids, so a capitalised folder of a live card was "orphaned"
  // and its confirmed files deleted.
  it("knows a capitalised folder as its live card's, and leaves non-card names alone", async () => {
    const upper = CARD.toUpperCase();
    noRows();
    scriptStorage(
      "list",
      { data: [{ name: upper, id: null }, { name: "not-a-card", id: null }, { name: `${GONE}x`, id: null }] },
      { data: [obj("k1-kept.png", 3)] },
    );
    script("tasks", { data: [{ id: CARD }] });
    script("task_attachments", { data: [{ storage_path: `task/${upper}/k1-kept.png` }] });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ folders: 1, orphanedObjects: 0, strayObjects: 0 });
    expect(removes()).toHaveLength(0);
    expect(calls.find((c) => c.table === "tasks")?.filters).toEqual([["in", "id", [CARD]]]);
  });

  // Bug hunt B8 (W.163): folders were read only while the offset stayed under
  // 2000, so every card folder past that was never checked.
  it("reads card folders to the end of the listing, a thousand at a time", async () => {
    const junk = (from: number) => Array.from({ length: 1000 }, (_, i) => ({ name: `junk-${from + i}`, id: null }));
    noRows();
    scriptStorage("list", { data: junk(0) }, { data: junk(1000) }, { data: [{ name: GONE, id: null }] }, { data: [obj("x1.png", 9)] });
    script("tasks", { data: [] });
    scriptStorage("remove", { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ orphanedObjects: 1, failed: [] });
    expect(listed().slice(0, 3).map((c) => (c.args[1] as { offset: number }).offset)).toEqual([0, 1000, 2000]);
  });

  // Bug hunt B12 (W.163): a folder was listed once with limit 1000, so its
  // objects past the thousandth stayed every night.
  it("lists a folder's objects past a thousand and removes them in storage-sized batches", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => obj(`x${i}.png`, 9));
    noRows();
    scriptStorage("list", { data: [{ name: GONE, id: null }] }, { data: many }, { data: [obj("last.png", 9)] });
    script("tasks", { data: [] });
    scriptStorage("remove", { data: [] }, { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ orphanedObjects: 1001, failed: [] });
    expect(removes().map((paths) => (paths as string[]).length)).toEqual([1000, 1]);
  });

  // B8, the expensive half: a live folder costs a listing and a row read, so
  // a night checks a window of them, and the window moves on each day.
  it("looks inside a window of live folders that moves on each night until every folder has been seen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const folders = Array.from({ length: 250 }, (_, i) => card(i + 1));
    const night = async (at: number) => {
      resetFake();
      vi.setSystemTime(at);
      noRows();
      scriptStorage("list", { data: folders.map((name) => ({ name, id: null })) }, ...folders.map(() => ({ data: [] })));
      script("tasks", ...[0, 100, 200].map((from) => ({ data: folders.slice(from, from + 100).map((id) => ({ id })) })));
      const { body } = await run();
      expect(body).toMatchObject({ folders: 250, foldersChecked: 200, failed: [] });
      return listed().slice(1).map((c) => String(c.args[0]).slice("task/".length));
    };
    const first = await night(Date.UTC(2026, 9, 5, 19, 40));
    const second = await night(Date.UTC(2026, 9, 6, 19, 40));
    expect(first).toHaveLength(200);
    expect(second).not.toEqual(first);
    expect(new Set([...first, ...second])).toEqual(new Set(folders));
  });

  it("deletes nothing on a failed read, and still runs the passes after it", async () => {
    script("task_attachments", { error: { message: "db down" } });
    script("task_attachments", { data: [] });
    scriptStorage("list", { data: [] });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.failed).toEqual([expect.stringMatching(/^unconfirmed uploads: .*db down/)]);
    expect(deletes()).toHaveLength(0);
    expect(removes()).toHaveLength(0);
    expect(listed()).toHaveLength(1);
  });

  // Bug hunt F6 (W.163): a throw from the folder pass lost the counts the row
  // passes had already built, so that night's removals appeared nowhere.
  it("keeps the counts of the passes that ran when a later pass throws", async () => {
    script("task_attachments", { data: [{ id: "u1", storage_path: `task/${CARD}/u1-a.png` }] }, { data: [{ id: "u1" }] });
    script("task_attachments", { data: [{ id: "a1", storage_path: `task/${CARD}/a1-b.pdf` }] }, { data: [{ id: "a1" }] });
    scriptStorage("remove", { data: [] }, { data: [] });
    scriptStorage("list", { error: { message: "storage down" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ unconfirmed: 1, archived: 1, failed: ["card folders: listing card folders: storage down"] });
  });

  it("deletes no orphan on a failed card read", async () => {
    noRows();
    scriptStorage("list", { data: [{ name: GONE, id: null }] });
    script("tasks", { error: { message: "db down" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.failed).toEqual([expect.stringMatching(/^card folders: .*db down/)]);
    expect(removes()).toHaveLength(0);
  });

  it("names a live folder it could not read, keeps its objects, and checks the folders after it", async () => {
    const other = card(9);
    noRows();
    scriptStorage(
      "list",
      { data: [{ name: other, id: null }, { name: CARD, id: null }] },
      { data: [obj("s1-stray.png", 2)] },
      { error: { message: "timeout" } },
    );
    script("tasks", { data: [{ id: CARD }, { id: other }] });
    script("task_attachments", { data: [] });
    scriptStorage("remove", { data: [] });
    const { body } = await run();
    expect(body).toMatchObject({ strayObjects: 1, foldersChecked: 1, failed: [`stray objects: listing ${CARD}: timeout`] });
    expect(removes()).toEqual([[`task/${other}/s1-stray.png`]]);
  });
});
