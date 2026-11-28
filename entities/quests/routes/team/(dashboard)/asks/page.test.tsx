import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Asks page (AK.2, ADR 0036), rendered from the rows its read takes from
// the database, the way a person would see it. The read is the real one; only
// the database, the guard and the signed-in reader are stand-ins. Every name is
// invented. Two invariants hold whatever the rows say: nobody still out on an
// ask appears anywhere in the asker's page (ADR 0020), even when the people
// table answers their name, and no game word reaches the page.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const guards: string[] = [];
const access = vi.hoisted(() => ({ roles: [] as { role: string }[] }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (atom: string) => (guards.push(atom), { roles: access.roles }),
}));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "me", authUserId: "auth-me" }) }));
// The entity's server door, with the real read and stand-in actions: the page
// only hands the actions to its buttons, and asks-model.test.ts proves which
// action each button calls.
vi.mock("@/entities/quests", async () => {
  const ok = async () => ({ ok: true as const });
  const { readAsksPage } = await import("../../../../lib/asks-read");
  return { readAsksPage, readParty: async () => STAFF, summonBounty: ok, turnIn: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok };
});
// The assistant door: the draft the reader's own chat kept, keyed by call id.
const drafts = new Map<string, unknown>();
vi.mock("@/entities/assistant", () => ({ findToolCall: async ({ callId }: { callId: string }) => drafts.get(callId) ?? null }));
const STAFF = [
  { personId: "me", name: "Kim Dao", initials: "KD" },
  { personId: "ari", name: "Ari Lund", initials: "AL" },
  { personId: "bo", name: "Bo Reyes", initials: "BR" },
];

const { default: AsksPage } = await import("./page");

// Wednesday 18 November 2026, 10:00 in Saigon.
const NOW = new Date("2026-11-18T03:00:00.000Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  resetFake();
  guards.length = 0;
  access.roles = [];
  drafts.clear();
});

const quest = (id: string, giver: string, title: string, required: boolean) => ({
  id, kind: "bounty", title, ask: "", giver_id: giver, state: "open", learning: false, required, closing_date: null, closed_at: null, created_at: "2026-11-16T03:00:00.000Z",
});
const head = (id: string, questId: string, ask: string, closesAt: string) => ({ id, quest_id: questId, position: 0, ask, closes_at: closesAt, closed_at: null });
const row = (id: string, questId: string, headId: string, personId: string, standing: string, extra: Record<string, unknown> = {}) => ({
  id, quest_id: questId, head_id: headId, person_id: personId, standing, late: false,
  accepted_at: null, turned_in_at: null, handed_back_at: null, missed_at: null, turn_in_text: null, turn_in_url: null, ...extra,
});
const person = (id: string, full_name: string) => ({ id, display_name: null, preferred_name: null, full_name, email: null, archived_at: null });

// A manager's required ask of the reader, a peer's optional one, and the
// reader's own optional ask: two answered, two are still out, and one handed it
// back, as the Quests page let a person do on an optional Bounty. The page shows
// no decline (AK.9), so that person is planted to prove they never appear.
const REQUIRED_ASK = "Send your flight times for the offsite";
const OPTIONAL_ASK = "Share one prompt that saved you an hour";
const OWN_ASK = "What is one thing you learned about AI this week?";
const QUESTS_ASKED_OF_ME = [quest("qw", "lead", REQUIRED_ASK, true), quest("qo", "peer", OPTIONAL_ASK, false)];
const OWN_QUEST = quest("qm", "me", OWN_ASK, false);
const HEADS = [
  head("hw", "qw", REQUIRED_ASK, "2026-11-20T11:00:00.000Z"),
  head("ho", "qo", OPTIONAL_ASK, "2026-11-26T11:00:00.000Z"),
  head("hm", "qm", OWN_ASK, "2026-11-25T11:00:00.000Z"),
];
const MY_ROWS = [row("pw", "qw", "hw", "me", "accepted"), row("po", "qo", "ho", "me", "called")];
const ROWS_ON_MY_ASK = [
  row("p1", "qm", "hm", "ari", "turned_in", { turned_in_at: "2026-11-17T03:00:00.000Z", turn_in_text: "Use the client's own words in the brief." }),
  row("p2", "qm", "hm", "bo", "turned_in", { turned_in_at: "2026-11-17T05:00:00.000Z", turn_in_text: "Ask it to argue the other side." }),
  row("p3", "qm", "hm", "dee", "handed_back", { handed_back_at: "2026-11-17T04:00:00.000Z" }),
  // The planted people still out: one who accepted, one still Called.
  row("p4", "qm", "hm", "oz", "accepted"),
  row("p5", "qm", "hm", "cy", "called"),
];
const PEOPLE = [
  person("lead", "Lena Lead"),
  person("peer", "Pia Peer"),
  person("ari", "Ari Answer"),
  person("bo", "Bo Brief"),
  person("dee", "Dee Decline"),
  // A people read that answers more than it was asked for still names nobody still out.
  person("oz", "Oz Absent"),
  person("cy", "Cy Called"),
];

function scriptTheTeam() {
  script("quest_party", { data: MY_ROWS }, { data: ROWS_ON_MY_ASK }, { data: [{ head_id: "ho" }] });
  script("quests", { data: [OWN_QUEST] }, { data: QUESTS_ASKED_OF_ME });
  script("quest_heads", { data: HEADS });
  // The reader thanked Bo's answer already.
  script("quest_reactions", { data: [{ party_id: "p2" }] });
  script("people", { data: PEOPLE });
}

const render = async () => renderToStaticMarkup(await AsksPage());
/** The markup of one section, from its heading to the next one. */
const section = (html: string, title: string) => {
  const from = html.indexOf(`>${title}</h2>`);
  const next = html.indexOf("</h2>", from + title.length + 6);
  return html.slice(from, next === -1 ? undefined : next);
};

describe("the Asks page", () => {
  it("opens behind quests.mine", async () => {
    script("quest_party", { data: [] });
    script("quests", { data: [] });
    await render();
    expect(guards[0]).toBe("quests.mine");
  });

  it("lists a required ask under Waiting on you, the reader's own under You asked, and an optional one under Open to anyone", async () => {
    scriptTheTeam();
    const html = await render();
    const order = ["Waiting on you", REQUIRED_ASK, "You asked", OWN_ASK, "Open to anyone", OPTIONAL_ASK].map((s) => html.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  // Khoa, 17 November 2026: a required ask is a task and cannot be declined.
  it("offers Answer alone on a required ask made of the reader, as on one open to anyone (AK.9)", async () => {
    scriptTheTeam();
    const html = await render();
    expect(html).not.toContain("Can&#x27;t this time");
    const waiting = section(html, "Waiting on you");
    expect(waiting).toContain("Lena Lead");
    expect(waiting).toContain("asked you");
    expect(waiting).toContain(">Answer<");
    expect(waiting).toContain("1 open");
    const open = section(html, "Open to anyone");
    expect(open).toContain("Pia Peer");
    expect(open).toContain("asked anyone");
    expect(open).toContain(">Answer<");
    expect(open).toContain("1 answer so far");
  });

  it("shows the asker N of M answered and the answers with their Thanks, and no decline", async () => {
    scriptTheTeam();
    const html = await render();
    const mine = section(html, "You asked");
    expect(mine).toContain("To 5 people");
    expect(mine).toContain("2 of 5 answered");
    expect(mine).toContain("Ari Answer");
    expect(mine).toContain("Use the client&#x27;s own words in the brief.");
    expect(mine).toContain(">Thanks<");
    expect(mine).toContain(">Thanked<");
    expect(mine).toContain(">Close now<");
    expect(mine).toContain(">Withdraw<");
    // The person who handed it back is neither drawn nor looked up, and no
    // read of the page selects a hand-back note (AK.9).
    expect(html).not.toContain("Dee Decline");
    const [names] = calls.filter((c) => c.table === "people");
    expect(names.filters.flat(2)).toContain("ari");
    expect(names.filters.flat(2)).not.toContain("dee");
    for (const read of calls.filter((c) => c.table === "quest_party")) expect(String(read.columns)).not.toMatch(/\bnote\b/);
  });

  it("never names anyone still out on the reader's ask, anywhere on the page (ADR 0020)", async () => {
    scriptTheTeam();
    const html = await render();
    expect(html).toContain("Ari Answer");
    for (const absent of ["Oz Absent", "Cy Called", "Oz", "Cy"]) expect(html).not.toContain(absent);
  });

  it("says no game word", async () => {
    scriptTheTeam();
    const html = (await render()).toLowerCase();
    for (const word of ["bounty", "giver", "hydra", "turn-in", "turn in", "quest"]) expect(html, word).not.toContain(word);
  });

  it("says plainly when nothing is asked, and draws no closed list while nothing has closed", async () => {
    script("quest_party", { data: [] });
    script("quests", { data: [] });
    const html = await render();
    expect(html).toContain("Nothing waiting. Nice.");
    expect(html).toContain("When a manager or an admin asks something of you, it shows here.");
    expect(html).toContain("Asks you make show here, with every answer.");
    expect(html).toContain("Nothing open to anyone right now.");
    expect(html).not.toContain("Closed in the last two weeks");
  });

  it("reads the reader's asks that closed in the last two weeks, and only those", async () => {
    scriptTheTeam();
    await render();
    // Two weeks before Wednesday 18 November, 10:00 in Saigon.
    const since = "2026-11-04T03:00:00.000Z";
    const [own] = calls.filter((c) => c.table === "quest_party");
    expect(own.filters).toContainEqual(["in", "standing", ["called", "accepted", "missed"]]);
    expect(own.filters).toContainEqual(["or", `state.eq.open,and(state.eq.closed,required.is.true,closed_at.gte.${since})`, { referencedTable: "quest" }]);
    const [given] = calls.filter((c) => c.table === "quests");
    expect(given.filters).toContainEqual(["or", `state.eq.open,and(state.eq.closed,closed_at.gte.${since})`]);
  });
});

// Closed in the last two weeks (AK.8): a manager's required ask the reader had
// not answered when it closed on Monday, and the reader's own ask that closed
// on Friday with one answer in time, one answer after the close, one person who
// handed it back and one who missed it.
describe("the Asks page's closed asks", () => {
  const LATE_ASK = "Share one thing you tried with Claude Code this sprint";
  const CLOSED_OWN_ASK = "Which client story should we tell at the town hall?";
  const MONDAY = "2026-11-16T11:00:00.000Z";
  const FRIDAY = "2026-11-13T11:00:00.000Z";
  const closedQuest = (id: string, giver: string, title: string, closedAt: string) => ({ ...quest(id, giver, title, true), state: "closed", closed_at: closedAt });
  const closedHead = (id: string, questId: string, ask: string, closedAt: string) => ({ ...head(id, questId, ask, closedAt), closed_at: closedAt });

  function scriptTheClosed() {
    script(
      "quest_party",
      { data: [row("pl", "ql", "hl", "me", "missed")] },
      {
        data: [
          row("c1", "qd", "hd", "ari", "turned_in", { turned_in_at: "2026-11-12T03:00:00.000Z", turn_in_text: "The retail client who cut their weekly report to an hour." }),
          row("c2", "qd", "hd", "dee", "handed_back", { handed_back_at: "2026-11-12T04:00:00.000Z" }),
          row("c3", "qd", "hd", "oz", "missed"),
          row("c4", "qd", "hd", "bo", "turned_in", { turned_in_at: "2026-11-16T03:00:00.000Z", late: true, turn_in_text: "The onboarding rebuild." }),
        ],
      },
      { data: [] },
    );
    script("quests", { data: [closedQuest("qd", "me", CLOSED_OWN_ASK, FRIDAY)] }, { data: [closedQuest("ql", "lead", LATE_ASK, MONDAY)] });
    script("quest_heads", { data: [closedHead("hl", "ql", LATE_ASK, MONDAY), closedHead("hd", "qd", CLOSED_OWN_ASK, FRIDAY)] });
    script("quest_reactions", { data: [] });
    script("people", { data: PEOPLE });
  }

  it("lists them after Open to anyone, the newest closed first, and leaves the open lists empty", async () => {
    scriptTheClosed();
    const html = await render();
    const order = ["Open to anyone", "Closed in the last two weeks", LATE_ASK, CLOSED_OWN_ASK].map((s) => html.indexOf(s));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Khoa, 17 November 2026: "Say it shows late".
    expect(html).toContain("You can still answer. It shows as late.");
    expect(html).not.toContain("counts in full");
    expect(html).toContain("Nothing waiting. Nice.");
    expect(section(html, "You asked")).toContain("Asks you make show here, with every answer.");
  });

  it("offers a late answer on an ask the reader had not answered, and nothing else", async () => {
    scriptTheClosed();
    const closed = section(await render(), "Closed in the last two weeks");
    expect(closed).toContain("Lena Lead");
    expect(closed).toContain("Closed Mon 16 Nov");
    expect(closed).toContain("You hadn&#x27;t answered when it closed. You still can.");
    expect(closed).toContain(">Answer late<");
    // The one move left is the answer, and no decline is offered anywhere.
    expect(closed).not.toContain("Can&#x27;t this time");
  });

  it("keeps the reader's own closed ask with its answers and Thanks, tags the late one, and has no decline, Close now or Withdraw", async () => {
    scriptTheClosed();
    const closed = section(await render(), "Closed in the last two weeks");
    expect(closed).toContain("Closed Fri 13 Nov");
    expect(closed).toContain("2 of 4 answered");
    expect(closed).toContain(">Thanks<");
    // Newest answer first: Bo's came after the close and carries the one Late tag; Ari's was in time.
    expect(closed.match(/>Late</g)).toHaveLength(1);
    const [bo, late, ari] = ["Bo Brief", ">Late<", "Ari Answer"].map((s) => closed.indexOf(s));
    expect(bo).toBeGreaterThan(-1);
    expect(late).toBeGreaterThan(bo);
    expect(ari).toBeGreaterThan(late);
    expect(closed).not.toContain("Dee Decline");
    expect(closed).not.toContain(">Close now<");
    expect(closed).not.toContain(">Withdraw<");
  });

  it("names nobody who missed the reader's closed ask (ADR 0020), and says no game word", async () => {
    scriptTheClosed();
    const html = await render();
    for (const absent of ["Oz Absent", "Oz", "missed"]) expect(html, absent).not.toContain(absent);
    for (const word of ["bounty", "giver", "hydra", "turn-in", "turn in", "quest"]) expect(html.toLowerCase(), word).not.toContain(word);
  });
});

// The New ask drawer (AK.3). It is closed until New ask is pressed, so these
// open it the one way a server render can: an assistant draft link.
describe("the Asks page's New ask button and draft link", () => {
  const CALL = "toolu_0123456789abcdef";
  const DRAFT = {
    instruction: "ask everyone to share one takeaway by Friday",
    title: "Share one takeaway",
    call: "everyone",
    heads: [{ ask: "Share one takeaway from the launch", date: "2026-11-20" }],
  };
  const renderWith = async (draft?: string) => renderToStaticMarkup(await AsksPage({ searchParams: Promise.resolve(draft ? { draft } : {}) }));
  const nothingScripted = () => {
    script("quest_party", { data: [] });
    script("quests", { data: [] });
  };

  it("offers New ask beside the heading, with the drawer closed", async () => {
    nothingScripted();
    const html = await renderWith();
    expect(html).toContain(">New ask</button>");
    expect(html).not.toContain("What are you asking?");
  });

  it("opens the drawer filled in from the draft, and says nothing is sent until Send ask", async () => {
    drafts.set(CALL, DRAFT);
    nothingScripted();
    const html = await renderWith(CALL);
    expect(html).toContain("Drafted by Claude");
    expect(html).toContain("ask everyone to share one takeaway by Friday");
    expect(html).toContain("Nothing is sent until you press Send ask. Change anything first.");
    expect(html).toContain(">Share one takeaway from the launch</textarea>");
    expect(html).toContain('value="2026-11-20"');
    expect(html).toContain(">Discard draft<");
    expect(html).toContain(">Send ask<");
  });

  it("opens with no draft for a call id the reader's own chat does not hold", async () => {
    nothingScripted();
    const html = await renderWith("toolu_someone_elses_call_id");
    expect(html).not.toContain("Drafted by Claude");
    expect(html).not.toContain("What are you asking?");
  });

  it("offers the required box to a manager or an admin, ticked, and to nobody else", async () => {
    drafts.set(CALL, DRAFT);
    for (const [roles, sees] of [[[{ role: "manager" }], true], [[{ role: "admin" }], true], [[{ role: "team-member" }], false]] as const) {
      access.roles = [...roles];
      nothingScripted();
      const html = await renderWith(CALL);
      expect(html.includes("Everyone asked should answer"), JSON.stringify(roles)).toBe(sees);
      if (sees) expect(html).toMatch(/type="checkbox"[^>]*checked/);
    }
  });

  it("says no game word in the open drawer either", async () => {
    drafts.set(CALL, DRAFT);
    access.roles = [{ role: "manager" }];
    nothingScripted();
    const html = (await renderWith(CALL)).toLowerCase();
    for (const word of ["bounty", "giver", "hydra", "turn-in", "turn in", "quest", "summon", "party"]) expect(html, word).not.toContain(word);
  });
});
