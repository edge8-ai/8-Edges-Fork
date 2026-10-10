import { describe, expect, it } from "vitest";
import {
  defaultFilters,
  filtersQuery,
  hasBoardParams,
  readFilters,
  restoredFilters,
  searchParamsObj,
  type FilterVocabulary,
} from "./workboard-filter-params";

// What the URL codec promises: a link reproduces the board exactly, a filter
// at its default leaves no trace in the address bar, and a value this board
// does not know is ignored rather than narrowing the board to nothing.

const vocab = (over: Partial<FilterVocabulary> = {}): FilterVocabulary => ({
  clients: ["c1", "c2"],
  boards: ["b1", "b2"],
  people: ["p1"],
  lanes: ["l1", "l2"],
  sprints: ["s1", "s2"],
  weeks: ["2026-W38"],
  epics: ["e1", "e2"],
  single: true,
  defaultSprint: "s1",
  views: ["board", "list"],
  groupings: ["lane", "priority", "assignee"],
  attention: ["blocked", "overdue"],
  ...over,
});

describe("readFilters", () => {
  it("reads every filter a link names", () => {
    const v = vocab();
    const s = readFilters(searchParamsObj("?client=c1,c2&board=b2&assignee=p1,unassigned&lane=l2&sprint=backlog&epic=e1,e2&attention=blocked&q=invoice"), v);
    expect(s).toEqual({
      client: ["c1", "c2"],
      board: ["b2"],
      assignee: ["p1", "unassigned"],
      lane: ["l2"],
      epic: ["e1", "e2"],
      sprint: "backlog",
      week: "all",
      undated: false,
      attention: ["blocked"],
      q: "invoice",
      view: "board",
      group: "lane",
      sort: "manual",
      collapsed: [],
      monthShift: 0,
    });
  });

  it("falls back to the defaults when the URL is silent", () => {
    const v = vocab();
    expect(readFilters({}, v)).toEqual(defaultFilters(v));
    expect(readFilters({}, v).sprint).toBe("s1");
  });

  it("ignores ids this board does not know", () => {
    const v = vocab();
    const s = readFilters(searchParamsObj("?client=c1,gone&board=nope&sprint=s9&epic=e9&lane=l1"), v);
    expect(s.client).toEqual(["c1"]);
    expect(s.board).toEqual([]);
    expect(s.sprint).toBe("s1");
    expect(s.epic).toEqual([]);
    expect(s.lane).toEqual(["l1"]);
  });

  it("ignores the sprint across boards, and the week on a single board", () => {
    const many = vocab({ single: false, defaultSprint: "all" });
    const s = readFilters(searchParamsObj("?sprint=s1&week=2026-W38"), many);
    expect(s.sprint).toBe("all");
    expect(s.week).toBe("2026-W38");
    expect(readFilters(searchParamsObj("?week=2026-W38"), vocab()).week).toBe("all");
  });

  // W.37: the epic filter is offered on every scope, so a link that names one
  // reproduces the board across boards too — which is where PR #1433's link
  // from the epics page now lands.
  it("keeps the epics across boards, singly or several", () => {
    const many = vocab({ single: false, defaultSprint: "all" });
    expect(readFilters(searchParamsObj("?epic=e2"), many).epic).toEqual(["e2"]);
    expect(readFilters(searchParamsObj("?epic=e1,e2"), many).epic).toEqual(["e1", "e2"]);
  });

  it("reads 'none' as a value beside the epics, not instead of them", () => {
    const v = vocab();
    expect(readFilters(searchParamsObj("?epic=none"), v).epic).toEqual(["none"]);
    expect(readFilters(searchParamsObj("?epic=e1,none,gone"), v).epic).toEqual(["e1", "none"]);
  });
});

describe("filtersQuery", () => {
  it("writes only what is narrowing the board, and keeps unrelated params", () => {
    const v = vocab();
    const s = { ...defaultFilters(v), client: ["c1", "c2"], q: "  invoice  " };
    expect(filtersQuery(searchParamsObj("?card=fix-login-030b0f26"), s, v)).toBe("?card=fix-login-030b0f26&client=c1%2Cc2&q=invoice");
  });

  it("drops a filter returned to its default", () => {
    const v = vocab();
    expect(filtersQuery(searchParamsObj("?client=c1&sprint=backlog&epic=e1"), defaultFilters(v), v)).toBe("");
  });

  it("round-trips: what it writes is what it reads back", () => {
    const v = vocab();
    const s = {
      client: ["c2"],
      board: ["b1"],
      assignee: ["unassigned"],
      lane: ["l1", "l2"],
      epic: ["e1", "none"],
      sprint: "s2",
      week: "all",
      undated: true,
      attention: ["blocked" as const, "overdue" as const],
      q: "acme",
      view: "list" as const,
      group: "assignee" as const,
      sort: "due" as const,
      collapsed: ["l1", "l2"],
      monthShift: 3,
    };
    expect(readFilters(searchParamsObj(filtersQuery({}, s, v)), v)).toEqual(s);
  });

  it("spells an explicit 'all sprints' out, since silence means the board's own sprint", () => {
    const v = vocab();
    const q = filtersQuery({}, { ...defaultFilters(v), sprint: "all" }, v);
    expect(q).toBe("?sprint=all");
    expect(readFilters(searchParamsObj(q), v).sprint).toBe("all");
  });
});

// W.105. The cards nobody has scheduled, as a filter rather than as a list the
// Schedule draws under every group.
describe("?undated=, the cards with no due date", () => {
  it("round-trips, and leaves no trace when it is off", () => {
    const v = vocab();
    expect(filtersQuery({}, { ...defaultFilters(v), undated: true }, v)).toBe("?undated=1");
    expect(readFilters(searchParamsObj("?undated=1"), v).undated).toBe(true);
    expect(filtersQuery({}, { ...defaultFilters(v), undated: false }, v)).toBe("");
  });

  it("only '1' turns it on, so a mangled link shows the board", () => {
    const v = vocab();
    expect(readFilters(searchParamsObj("?undated=yes"), v).undated).toBe(false);
    expect(readFilters(searchParamsObj("?undated=0"), v).undated).toBe(false);
    expect(readFilters(searchParamsObj("?undated="), v).undated).toBe(false);
  });

  it("is offered on every scope, unlike the sprint and the week", () => {
    // A sprint means nothing across boards and a week means nothing on one,
    // so each is read on one scope only. "What has nobody scheduled" is the
    // same question either way, so it is read on both.
    expect(readFilters(searchParamsObj("?undated=1"), vocab({ single: true })).undated).toBe(true);
    expect(readFilters(searchParamsObj("?undated=1"), vocab({ single: false })).undated).toBe(true);
  });

  it("is a filter, so a link naming it is the sender's board (W.99)", () => {
    expect(hasBoardParams(searchParamsObj("?undated=1"))).toBe(true);
  });
});

describe("hasBoardParams", () => {
  it("is false for a URL that names nothing about the board", () => {
    // ?card= addresses an open drawer, not the board behind it.
    expect(hasBoardParams(searchParamsObj("?card=fix-login-030b0f26"))).toBe(false);
    expect(hasBoardParams({})).toBe(false);
  });

  it("is true as soon as a filter is named, and an empty one names nothing", () => {
    expect(hasBoardParams(searchParamsObj("?lane=l1"))).toBe(true);
    expect(hasBoardParams(searchParamsObj("?q="))).toBe(false);
  });
});

// W.25, W.26, W.27: how the board is DRAWN rides in the same URL state as the
// filters, through the same codec, so one link carries both — but it is not a
// filter, so it never counts as one.
describe("the view, the grouping and the sort", () => {
  it("reads them from a link the surface can honour", () => {
    const v = vocab({ views: ["board", "list"], groupings: ["lane", "epic", "assignee"] });
    const s = readFilters(searchParamsObj("?view=list&group=epic&sort=due"), v);
    expect(s.view).toBe("list");
    expect(s.group).toBe("epic");
    expect(s.sort).toBe("due");
  });

  it("falls back to the default when the surface does not offer it", () => {
    // The epic grouping is not on the menu across boards (W.41), and the
    // portal offers no date view at all — a stale link naming either shows the
    // board rather than a blank page.
    const v = vocab({ views: ["board", "list"], groupings: ["lane", "assignee"] });
    expect(readFilters(searchParamsObj("?group=epic"), v).group).toBe("lane");
    expect(readFilters(searchParamsObj("?view=calendar"), v).view).toBe("board");
    // The two retired names, on a surface that DOES offer the date view: the
    // rule W.97.5 set is that a removed view stays decodable, and W.109 leans
    // on it for the Schedule the way W.97.5 leant on it for the Calendar.
    const all = vocab({ views: ["board", "list", "calendar"] });
    expect(readFilters(searchParamsObj("?view=schedule"), all).view).toBe("board");
    expect(readFilters(searchParamsObj("?view=timeline"), all).view).toBe("board");
    expect(readFilters(searchParamsObj("?view=calendar"), all).view).toBe("calendar");
    expect(readFilters(searchParamsObj("?sort=alphabetical"), v).sort).toBe("manual");
  });

  it("leaves no trace in the URL at its default", () => {
    const v = vocab();
    expect(filtersQuery({}, { ...defaultFilters(v), view: "board", group: "lane", sort: "manual" }, v)).toBe("");
    expect(filtersQuery({}, { ...defaultFilters(v), group: "assignee", sort: "due" }, v)).toBe("?group=assignee&sort=due");
  });

  it("is not a filter, but it IS the sender's board, so it displaces the remembered set", () => {
    // W.99, reversing the first cut. The view stays out of the filter sentence
    // because it narrows nothing, and that is still right — but the guard
    // deciding whether a remembered set may overwrite a link is a different
    // question, and answering it from the filter list alone lost the sender's
    // board: on production a link to ?view=list opened the Calendar under the
    // last reader's assignee filter.
    expect(hasBoardParams(searchParamsObj("?view=list&group=assignee&sort=due"))).toBe(true);
    expect(hasBoardParams(searchParamsObj("?view=board"))).toBe(true);
  });
});

// W.92.4. The folded columns ride in the SAME codec as the view, the grouping
// and the sort — there is no second place a board's shape is written down.
describe("?collapsed=, the folded columns", () => {
  it("round-trips a folded set, comma separated", () => {
    const v = vocab();
    const q = filtersQuery({}, { ...defaultFilters(v), collapsed: ["Done", "Waiting"] }, v);
    expect(q).toBe("?collapsed=Done%2CWaiting");
    expect(readFilters(searchParamsObj(q), v).collapsed).toEqual(["Done", "Waiting"]);
  });

  it("leaves no trace in the URL when nothing is folded", () => {
    const v = vocab();
    expect(filtersQuery({}, defaultFilters(v), v)).toBe("");
  });

  it("is not a filter, but a link that names it is still the sender's board (W.99)", () => {
    // A folded column keeps every card it holds, so the board is not narrowed
    // and this stays out of the filter sentence. It is still part of what the
    // sender was looking at, so it must not be overwritten by this browser's
    // remembered set.
    expect(hasBoardParams(searchParamsObj("?collapsed=Done"))).toBe(true);
  });

  it("drops what is not a column id, and caps how many it will read", () => {
    // The one value read without a vocabulary (a column id depends on the
    // grouping being decoded beside it), so the SHAPE is all this layer can
    // check — the board drops ids matching no column it draws.
    const v = vocab();
    expect(readFilters(searchParamsObj("?collapsed=Done,,%20,Done,ok-1"), v).collapsed).toEqual(["Done", "ok-1"]);
    expect(readFilters(searchParamsObj("?collapsed=a b,c%2Fd,e"), v).collapsed).toEqual(["e"]);
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`).join(",");
    expect(readFilters(searchParamsObj(`?collapsed=${many}`), v).collapsed).toHaveLength(24);
  });
});

// W.119. The sidebar has a row per view, so a bare link is the Board row, and
// the remembered set must not turn it into the List or the Calendar.
describe("restoredFilters", () => {
  it("brings back the remembered filters, grouping and sort", () => {
    const f = restoredFilters("?assignee=p1&group=priority&sort=due", vocab());
    expect(f.assignee).toEqual(["p1"]);
    expect(f.group).toBe("priority");
    expect(f.sort).toBe("due");
  });

  it("never brings back the view", () => {
    expect(restoredFilters("?view=list&assignee=p1", vocab()).view).toBe(defaultFilters(vocab()).view);
    expect(restoredFilters("?view=list&assignee=p1", vocab()).view).toBe("board");
  });

  it("never brings back the calendar's month, which belongs to the view", () => {
    expect(restoredFilters("?view=calendar&month=1&assignee=p1", vocab({ views: ["board", "list", "calendar"] })).monthShift).toBe(0);
  });
});

// W.121. The Flow tiles link to ?attention=blocked and ?attention=overdue.
describe("?attention=, the cards that need it", () => {
  it("reads the kinds it knows and drops the rest", () => {
    expect(readFilters(searchParamsObj("?attention=blocked"), vocab()).attention).toEqual(["blocked"]);
    expect(readFilters(searchParamsObj("?attention=overdue,blocked"), vocab()).attention).toEqual(["overdue", "blocked"]);
    expect(readFilters(searchParamsObj("?attention=late"), vocab()).attention).toEqual([]);
  });

  it("drops a kind the board cannot answer, so a client-safe board is never filtered to nothing", () => {
    expect(readFilters(searchParamsObj("?attention=blocked,overdue"), vocab({ attention: ["overdue"] })).attention).toEqual(["overdue"]);
  });

  it("is a filter, so a link carrying it is a sent board and names itself in the sentence", () => {
    expect(hasBoardParams(searchParamsObj("?attention=overdue"))).toBe(true);
    expect(filtersQuery({}, { ...defaultFilters(vocab()), attention: ["overdue"] }, vocab())).toBe("?attention=overdue");
  });
});

// W.166, Khoa 2026-10-05: "Filter should always default to the logged-in
// user". The Workboard pages hand the codec the viewer as the default
// assignee; every other surface hands it nothing and keeps its old behaviour.
describe("the signed-in person as the default assignee (W.166)", () => {
  const me = vocab({ people: ["p1", "p2"], defaultAssignee: ["p1"] });

  it("opens on the viewer's cards when the URL names no assignee, and writes nothing for it", () => {
    const s = readFilters(searchParamsObj(""), me);
    expect(s.assignee).toEqual(["p1"]);
    expect(filtersQuery({}, s, me)).toBe("");
  });

  it("keeps a cleared assignee cleared across a reload, as ?assignee=all", () => {
    const cleared = { ...readFilters(searchParamsObj(""), me), assignee: [] };
    const q = filtersQuery({}, cleared, me);
    expect(q).toBe("?assignee=all");
    expect(readFilters(searchParamsObj(q), me).assignee).toEqual([]);
  });

  it("still reads a link that names someone else", () => {
    expect(readFilters(searchParamsObj("?assignee=p2"), me).assignee).toEqual(["p2"]);
  });

  it("does not let the remembered set change whose cards a fresh visit opens on", () => {
    expect(restoredFilters("?assignee=all&client=c1", me)).toMatchObject({ assignee: ["p1"], client: ["c1"] });
    expect(restoredFilters("?assignee=p2", me).assignee).toEqual(["p1"]);
  });

  it("changes nothing on a surface with no default", () => {
    const v = vocab();
    expect(readFilters(searchParamsObj(""), v).assignee).toEqual([]);
    expect(filtersQuery({}, { ...defaultFilters(v), assignee: [] }, v)).toBe("");
    expect(restoredFilters("?assignee=p1", v).assignee).toEqual(["p1"]);
  });
});
