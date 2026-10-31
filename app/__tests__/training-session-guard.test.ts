import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// QS.5b at the request seam, against this deployment's real declarations and
// Training's real Host implier. The organiser's session page and its three
// moves on one session (mark the register, move the time, cancel) ask for
// training.host, which a Raid's Host holds through the implied Host role and
// every organiser holds too. The atom opens them; mayRunSession then keeps a
// reader without training.organise to a taught session they organise, and the
// session's read and every write find only a session the reader organises. A
// Host's move changes the time and nothing else. The rest of the page's moves
// stay on training.organise, and the page does not draw them for a Host.
//
// Real here: the guard, the resolver, the declared rows (each atom's holders
// and each role bundle, what access:sync and the QS.5b access rows seed), the
// implier, the per-session check, the session's read, the register's
// correction and the move and cancel writers, all over the house fake. Stubs:
// the plan, homework, recap and transcript writers, which a Host never reaches.
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
});
const notFound = vi.fn(() => {
  throw new Error("notFound");
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), notFound: () => notFound() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const recordAudit = vi.fn(async (_row: Record<string, unknown>) => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: (row: Record<string, unknown>) => recordAudit(row) }));
const publish = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/kernel/events", () => ({ publish: (...args: unknown[]) => publish(...args) }));
vi.mock("@/kernel/shell/surface", () => ({ currentSurface: async () => "team" }));
vi.mock("@/kernel/approvals/waiting", () => ({ hasWaitingOn: async () => false }));
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

/** Who is signed in: a team member, whether they hold the Admin grant or the Training organiser role, and whether someone reports to them. */
type Who = { id: string; admin?: boolean; organiser?: boolean; reports?: boolean };
let who: Who | null = null;
const actor = () => ({
  authUserId: who!.id,
  email: `${who!.id}@example.test`,
  personId: `p-${who!.id}`,
  teamMemberId: `tm-${who!.id}`,
  employmentType: "full_time",
  permissions: [],
  personScope: who!.reports ? [`p-${who!.id}`, "p-report"] : [`p-${who!.id}`],
});
vi.mock("@/kernel/identity/session-user", () => ({ getSessionUser: async () => (who ? { id: who.id, email: `${who.id}@example.test` } : null) }));
vi.mock("@/kernel/identity/admin-register", () => ({ holdsAdminGrant: async () => Boolean(who?.admin), holdsSuperAdminGrant: async () => false }));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: async () => ({ actor: who ? actor() : null }), requireTeamMember: async () => actor() }));
vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor: null }) }));
vi.mock("@/kernel/identity/access-rows", async () => {
  const { PERMISSIONS } = await import("@/app/permissions");
  const rows = [
    ...Object.entries(PERMISSIONS.atoms).flatMap(([permission, atom]) => atom.holders.map((h) => ({ role: h.role, permission, scope: h.scope }))),
    ...Object.entries(PERMISSIONS.roles).flatMap(([role, r]) => r.atoms.map((a) => ({ role, permission: a.permission, scope: a.scope }))),
  ];
  return {
    rolePermissionsFromDb: async (roles: readonly string[]) => rows.filter((r) => roles.includes(r.role)),
    assignedRoles: async () => (who?.organiser ? [{ role: "training-organiser", because: "was granted it" }] : []),
    personIdForAuthUser: async () => null,
  };
});

// Stubs for the moves a Host never reaches: reaching one proves the guard let the reader in.
const REACHED = { ok: false as const, error: "reached" };
vi.mock("@/entities/training/lib/session-plan", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  markChecked: async () => REACHED,
  saveBlocks: async () => REACHED,
  saveMaterials: async () => REACHED,
}));
vi.mock("@/entities/training/lib/prep-draft", () => ({ draftAndSave: async () => REACHED }));
vi.mock("@/entities/training/lib/session-recap", () => ({ saveRecap: async () => REACHED }));
vi.mock("@/entities/training/lib/learner-notes", () => ({ appendToNote: async () => REACHED }));
vi.mock("@/entities/training/lib/homework-standing", () => ({ homeworkStanding: async () => [] }));
vi.mock("@/entities/training/lib/assignments", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  setAssignment: async () => REACHED,
  withdrawAssignment: async () => REACHED,
  sessionHomework: async () => null,
  signDownload: async () => REACHED,
}));
vi.mock("@/entities/training/routes/team/(dashboard)/training/sessions/[id]/transcript-in", () => ({ readSessionTranscript: async () => null, saveTranscriptIn: async () => REACHED }));
vi.mock("@/entities/training/lib/lesson-feedback", () => ({ lessonFeedback: async () => [], saveLearnerFeedback: async () => REACHED }));
vi.mock("@/entities/training/lib/english-evaluation", () => ({ evaluateLesson: async () => REACHED }));

import { PERMISSIONS } from "@/app/permissions";
import { accessContributions as trainingAccess } from "@/entities/training";
import { registerAccessContributions } from "@/kernel/identity/access-contributions";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";

const SESSION_DIR = "@/entities/training/routes/team/(dashboard)/training/sessions/[id]";
const HOST: Who = { id: "host" };
const MEMBER: Who = { id: "member" };
const LEAD: Who = { id: "lead", organiser: true };
const ADMIN: Who = { id: "admin", admin: true };
const MANAGER: Who = { id: "manager", reports: true };
const MINE = "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";
const OTHER = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const PAST = "2026-10-20T09:00:00Z";
const FUTURE = "2099-01-01T09:00:00Z";
const REFUSED_HOST = "redirect:/team/refused?p=training.host";
const REFUSED_ORGANISE = "redirect:/team/refused?p=training.organise";
const TYPES = { data: [{ id: "ty-sharing", name: "Sharing session", sort_order: 40, archived_at: null }, { id: "ty-class", name: "Class", sort_order: 10, archived_at: null }] };

beforeEach(() => {
  resetFake();
  who = null;
  registerPermissionRegistry(PERMISSIONS);
  registerAccessContributions([trainingAccess]);
  vi.clearAllMocks();
});

/** The implied Host role's fact, as Training's implier reads it for the next request: does the reader host a taught session? */
const hosts = (yes: boolean) => {
  script("training_types", TYPES);
  script("trainings", { data: yes ? [{ id: MINE }] : [] });
};
/** mayRunSession's read for a reader without training.organise: is this session a taught one they organise? */
const runs = (yes: boolean) => {
  script("training_types", TYPES);
  script("trainings", { data: yes ? [{ id: MINE }] : [] });
};
/** The trainings reads were the implier's and the taught-session check's, and nothing read the session itself. */
const onlyTheTaughtCheck = () => {
  const reads = calls.filter((c) => c.table === "trainings");
  return reads.length === 2 && reads.every((c) => c.filters.some((f) => f[1] === "type_id"));
};
const writes = () => calls.filter((c) => c.ops.some((op) => ["insert", "update", "upsert", "delete"].includes(op)));
const sessionRow = (organiser: string) => ({ id: MINE, title: "prompt evals", notes: null, starts_at: PAST, ends_at: PAST, cancelled_at: null, plan_id: null, plan_state: "none", plan_reasoning: null, materials: [], recap: null, recap_state: "none", plan: null, attendance: [], blocks: [], organiser_id: organiser });
const registerRow = (organiser: string, person: string) => ({ id: "a1", person_id: person, status: "pending", source: "member", reviews: [], training: { organiser_id: organiser, starts_at: PAST, ends_at: PAST, cancelled_at: null, self_logged: false, created_at: "2026-10-19T00:00:00Z" } });
type Page = { props: { children: { props: Record<string, unknown> }[] } };

async function page(id: string): Promise<Page> {
  const { default: SessionPage } = await import(`${SESSION_DIR}/page`);
  return SessionPage({ params: Promise.resolve({ id }) });
}

/** The page's moves that stay on training.organise, each called with what the guard needs and nothing a write could use. */
async function organiserMoves() {
  const s = await import(`${SESSION_DIR}/actions`);
  return {
    saveBlocks: () => s.saveBlocksAction(MINE, {}),
    markChecked: () => s.markCheckedAction(MINE),
    redraft: () => s.redraftAction(MINE),
    saveMaterials: () => s.saveMaterialsAction(MINE, {}),
    setAssignment: () => s.setAssignmentAction(MINE, {}),
    withdrawAssignment: () => s.withdrawAssignmentAction(MINE),
    openSubmission: () => s.openSubmissionAction("training-uploads/x"),
    saveTranscript: () => s.saveTranscriptAction(MINE, {}),
    saveRecap: () => s.saveRecapAction(MINE, {}),
    publishRecap: () => s.publishRecapAction(MINE, {}),
    addToNote: () => s.addToNoteAction(OTHER, "p-mate", "line"),
    evaluateEnglish: () => s.evaluateEnglishAction(MINE),
    saveLearnerFeedback: () => s.saveLearnerFeedbackAction(MINE, "p-mate", "Good."),
  };
}

async function hostMoves() {
  const s = await import(`${SESSION_DIR}/actions`);
  const t = await import("@/entities/training/routes/team/(dashboard)/training/actions");
  return { s, t };
}

describe("a Host without the Training organiser role", () => {
  it("opens their own taught session's page, read for them as its organiser, with only the register drawn", async () => {
    who = HOST;
    hosts(true);
    runs(true);
    script("trainings", { data: [sessionRow("p-host")] });
    script("training_exercises", { data: [] });
    const el = await page(MINE);
    const read = calls.filter((c) => c.table === "trainings")[2];
    expect(read?.filters).toEqual(expect.arrayContaining([["eq", "id", MINE], ["eq", "organiser_id", "p-host"]]));
    const [head, body] = el.props.children;
    expect((head?.props.eyebrow as { type: unknown }).type).toBe("span");
    // It has started, so there is no When card: only the register.
    const drawn = (body?.props.children as ({ props: Record<string, unknown> } | null)[]).filter(Boolean);
    expect(drawn).toHaveLength(1);
    expect(Object.keys(drawn[0]!.props)).toEqual(expect.arrayContaining(["sessionId", "people", "started", "set"]));
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("is offered Move and Cancel above the register before their fire starts, a move that sends the time alone (QS.5c)", async () => {
    who = HOST;
    hosts(true);
    runs(true);
    script("trainings", { data: [{ ...sessionRow("p-host"), starts_at: FUTURE, ends_at: FUTURE }] });
    script("training_exercises", { data: [] });
    const el = await page(MINE);
    const [, body] = el.props.children;
    const [when, register] = (body?.props.children as { props: Record<string, unknown> }[]).filter(Boolean);
    expect(when?.props).toMatchObject({ sessionId: MINE, keep: null, taught: true, leaveTo: "/team/my-training", parts: { date: "2099-01-01", start: "16:00", minutes: 0 } });
    const { t } = await hostMoves();
    expect((when?.props.actions as Record<string, unknown>).update).toBe(t.updateTrainingAction);
    expect((when?.props.actions as Record<string, unknown>).cancel).toBe(t.cancelTrainingAction);
    expect(Object.keys(register!.props)).toEqual(expect.arrayContaining(["set"]));
  });

  it("is shown no page for a session that is not a taught session they organise, and nothing about it is read", async () => {
    who = HOST;
    hosts(true);
    runs(false);
    await expect(page(OTHER)).rejects.toThrow("notFound");
    expect(calls.filter((c) => c.table === "trainings")).toHaveLength(2);
  });

  it("marks someone who came on their own fire's register, as its organiser, and cannot mark themselves", async () => {
    who = HOST;
    const { s } = await hostMoves();
    hosts(true);
    runs(true);
    script("training_attendance", { data: [registerRow("p-host", "p-mate")] }, { data: null });
    expect(await s.setAttendanceAction(MINE, "p-mate", "attended")).toEqual({ ok: true });
    expect(writes()[0]?.payloads[0]).toMatchObject({ status: "attended", source: "organiser" });
    expect(publish).toHaveBeenCalledWith("training.attendance.marked", { trainingId: MINE, personId: "p-mate", status: "attended" });

    hosts(true);
    runs(true);
    script("training_attendance", { data: [registerRow("p-host", "p-host")] });
    expect(await s.setAttendanceAction(MINE, "p-host", "attended")).toEqual({ ok: false, error: "A word about yourself is yours to give on My Training." });
    expect(writes()).toHaveLength(1);
  });

  it("moves their own fire's time, and only its time: a title, notes or people sent with it are refused", async () => {
    who = HOST;
    const { t } = await hostMoves();
    hosts(true);
    runs(true);
    script("trainings", { data: [{ id: MINE, starts_at: FUTURE, cancelled_at: null, attendance: [] }] }, { data: null });
    expect(await t.updateTrainingAction(MINE, { date: "2099-01-02", start: "16:00", minutes: 20 })).toEqual({ ok: true });
    const [moved] = writes();
    expect(moved?.payloads[0]).toEqual({ starts_at: "2099-01-02T09:00:00.000Z", ends_at: "2099-01-02T09:20:00.000Z" });
    expect(moved?.filters).toContainEqual(["eq", "organiser_id", "p-host"]);

    for (const input of [
      { title: "renamed", date: "2099-01-02", start: "16:00", minutes: 20 },
      { notes: "new notes", date: "2099-01-02", start: "16:00", minutes: 20 },
    ]) {
      hosts(true);
      runs(true);
      expect(await t.updateTrainingAction(MINE, input)).toEqual({ ok: false, error: "You can move a session you host, not rename it or change its notes." });
    }
    hosts(true);
    runs(true);
    expect(await t.updateTrainingAction(MINE, { date: "2099-01-02", start: "16:00", minutes: 20, personIds: [OTHER] })).toEqual({ ok: false, error: "People take their own seat at a session you host." });
    expect(writes()).toHaveLength(1);
  });

  it("cancels their own fire", async () => {
    who = HOST;
    const { t } = await hostMoves();
    hosts(true);
    runs(true);
    script("trainings", { data: [{ id: MINE, starts_at: FUTURE, cancelled_at: null, attendance: [] }] }, { data: null });
    expect(await t.cancelTrainingAction(MINE)).toEqual({ ok: true });
    expect(writes()[0]?.filters).toContainEqual(["eq", "organiser_id", "p-host"]);
  });

  it("runs none of the three moves on a session that is not a taught session they organise", async () => {
    who = HOST;
    const { s, t } = await hostMoves();
    for (const move of [() => s.setAttendanceAction(OTHER, "p-mate", "attended"), () => t.updateTrainingAction(OTHER, { date: "2099-01-02", start: "16:00", minutes: 20 }), () => t.cancelTrainingAction(OTHER)]) {
      hosts(true);
      runs(false);
      expect(await move()).toMatchObject({ ok: false, error: expect.stringMatching(/was not found/) });
    }
    expect(writes()).toEqual([]);
    expect(calls.filter((c) => c.table === "training_attendance")).toEqual([]);
  });

  it("is refused every move that stays on training.organise, and Training's list", async () => {
    who = HOST;
    for (const [name, move] of Object.entries(await organiserMoves())) {
      hosts(true);
      await expect(move(), name).rejects.toThrow(REFUSED_ORGANISE);
    }
    const t = await import("@/entities/training/routes/team/(dashboard)/training/actions");
    hosts(true);
    await expect(t.scheduleTrainingAction({})).rejects.toThrow(REFUSED_ORGANISE);
    const { default: ListPage } = await import("@/entities/training/routes/team/(dashboard)/training/page");
    hosts(true);
    await expect(ListPage()).rejects.toThrow(REFUSED_ORGANISE);
    expect(writes()).toEqual([]);
  });
});

describe("a former organiser who now hosts one fire", () => {
  // They organised a Class while they held training.organise; the role was
  // revoked, and lighting a fire made them a Host. training.host opens the
  // session page to them, and their old Class must not come back with it.
  // Each case scripts what the organiser-only filters would find for the Class
  // (they do organise it), so only the taught-session check can refuse it.
  const oldClass = { id: OTHER, starts_at: FUTURE, cancelled_at: null, attendance: [] };

  it("gets no page for a training they organised that is not a taught session", async () => {
    who = HOST;
    hosts(true);
    runs(false);
    script("trainings", { data: [sessionRow("p-host")] });
    script("training_exercises", { data: [] });
    await expect(page(OTHER)).rejects.toThrow("notFound");
    expect(onlyTheTaughtCheck()).toBe(true);
  });

  it("cannot mark its register", async () => {
    who = HOST;
    const { s } = await hostMoves();
    hosts(true);
    runs(false);
    script("training_attendance", { data: [registerRow("p-host", "p-mate")] }, { data: null });
    expect(await s.setAttendanceAction(OTHER, "p-mate", "attended")).toEqual({ ok: false, error: "That session was not found." });
    expect(writes()).toEqual([]);
  });

  it("cannot move it or cancel it", async () => {
    who = HOST;
    const { t } = await hostMoves();
    hosts(true);
    runs(false);
    script("trainings", { data: [oldClass] }, { data: null });
    expect(await t.updateTrainingAction(OTHER, { date: "2099-01-02", start: "16:00", minutes: 20 })).toEqual({ ok: false, error: "That training was not found." });
    expect(onlyTheTaughtCheck()).toBe(true);
    resetFake();
    hosts(true);
    runs(false);
    script("trainings", { data: [oldClass] }, { data: null });
    expect(await t.cancelTrainingAction(OTHER)).toEqual({ ok: false, error: "That training was not found." });
    expect(onlyTheTaughtCheck()).toBe(true);
    expect(writes()).toEqual([]);
  });
});

describe("a member who hosts nothing and holds no organiser role", () => {
  it("is refused the page and every move before anything about a session is read", async () => {
    who = MEMBER;
    const { s, t } = await hostMoves();
    const host = { setAttendance: () => s.setAttendanceAction(MINE, "p-mate", "attended"), update: () => t.updateTrainingAction(MINE, {}), cancel: () => t.cancelTrainingAction(MINE) };
    hosts(false);
    await expect(page(MINE)).rejects.toThrow(REFUSED_HOST);
    for (const [name, move] of Object.entries(host)) {
      hosts(false);
      await expect(move(), name).rejects.toThrow(REFUSED_HOST);
    }
    for (const [name, move] of Object.entries(await organiserMoves())) {
      hosts(false);
      await expect(move(), name).rejects.toThrow(REFUSED_ORGANISE);
    }
    // Every trainings read was the implier's, asking whether they host anything.
    expect(calls.filter((c) => c.table === "trainings").every((c) => c.filters.some((f) => f[1] === "type_id"))).toBe(true);
    expect(writes()).toEqual([]);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "access_refusals", context: expect.objectContaining({ permission: "training.host" }) }));
  });
});

describe.each([
  ["a Training organiser", LEAD, "p-lead"],
  ["an Admin", ADMIN, "p-admin"],
  ["a manager", MANAGER, "p-manager"],
] as const)("%s", (_name, person, personId) => {
  it("opens the whole page for a session they organise, any kind, as before, never asked whether it is taught", async () => {
    who = person;
    hosts(false);
    script("trainings", { data: [sessionRow(personId)] });
    script("training_exercises", { data: [] });
    const el = await page(MINE);
    const trainingsReads = calls.filter((c) => c.table === "trainings");
    expect(trainingsReads).toHaveLength(2);
    expect(trainingsReads[1]?.filters).toContainEqual(["eq", "organiser_id", personId]);
    const [head, body] = el.props.children;
    expect((head?.props.eyebrow as { props: { href: string } }).props.href).toBe("/team/training");
    // The recording and summary, the plan, the homework, the transcript, the
    // register, the recap, and each learner's English and feedback (ADR 0016,
    // amended 2026-10-26).
    expect((body?.props.children as unknown[]).filter(Boolean)).toHaveLength(7);
  });

  it("is offered the When card first before the session starts, a move that keeps the title and notes (QS.5c)", async () => {
    who = person;
    hosts(false);
    script("trainings", { data: [{ ...sessionRow(personId), notes: "Bring a laptop", starts_at: FUTURE, ends_at: FUTURE }] });
    script("training_exercises", { data: [] });
    // Whether it is a taught session, asked for an organiser's: this one is not, so cancelling names no fire.
    script("training_types", TYPES);
    script("trainings", { data: [] });
    const el = await page(MINE);
    const [, body] = el.props.children;
    const drawn = (body?.props.children as { props: Record<string, unknown> }[]).filter(Boolean);
    // When, then the plan, the homework and the register; the transcript and recap wait for it to start.
    expect(drawn).toHaveLength(4);
    expect(drawn[0]?.props).toMatchObject({ sessionId: MINE, keep: { title: "prompt evals", notes: "Bring a laptop" }, leaveTo: null, taught: false });
  });

  it("passes the guard on every move, and moves with a title as before", async () => {
    who = person;
    for (const [name, move] of Object.entries(await organiserMoves())) {
      hosts(false);
      // Past the guard, Evaluate English reads the session first: none here, so it stops.
      if (name === "evaluateEnglish") script("trainings", { data: [] });
      await expect(move(), name).resolves.toMatchObject({ ok: false });
    }
    const { t } = await hostMoves();
    hosts(false);
    script("trainings", { data: [{ id: MINE, starts_at: FUTURE, cancelled_at: null, attendance: [] }] }, { data: null });
    expect(await t.updateTrainingAction(MINE, { title: "Renamed", date: "2099-01-02", start: "16:00", minutes: 20 })).toEqual({ ok: true });
    expect(writes()[0]?.payloads[0]).toMatchObject({ title: "Renamed" });
    expect(recordAudit.mock.calls.filter((c) => c[0].table === "access_refusals")).toEqual([]);
  });
});
