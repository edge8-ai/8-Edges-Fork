import { describe, expect, it } from "vitest";
import { BEACON_BAD_LINK, BEACON_NO_LINK, BEACON_NO_TITLE, beaconFormError, handsFireOffers, heldFiresOf, safeLink, shapeLit, tipSide } from "./lighthouse-model";
import type { FireSession } from "./evolve-model";
import type { BeaconRow, HostedRaidRow } from "./rows";

// Lighthouses' pure half (QS.6): which held fires offer a Beacon (the held
// rule itself is evolve-model's, tested there), the form's refusals in the
// form's order, the links the page will draw, and the horizon's order and
// spacing.

const NOW = new Date("2026-10-24T09:00:00Z");
const ENDED = "2026-10-23T09:20:00Z";
const LATER = "2026-10-24T09:20:00Z";
const session = (over: Partial<FireSession> = {}): FireSession => ({ endsAt: ENDED, cancelled: false, selfLogged: false, attended: ["mai"], ...over });

describe("heldFiresOf", () => {
  const raids: HostedRaidRow[] = [
    { id: "r1", title: "Prompt evals", origin_idea_id: null, training_id: "t1" },
    { id: "r2", title: "Lark bots", origin_idea_id: null, training_id: "t2" },
    { id: "r3", title: "Our proposal template", origin_idea_id: "idea-1", training_id: "t3" },
    { id: "r4", title: "Figma to code", origin_idea_id: null, training_id: "t4" },
  ];
  const sessions = new Map<string, FireSession>([
    ["t1", session()],
    ["t2", session({ endsAt: LATER })],
    ["t3", session()],
    ["t4", session()],
  ]);

  it("keeps the held fires that have no live Beacon yet, with the learning a fire grew from", () => {
    expect(heldFiresOf(raids, "host", sessions, new Set(["r4"]), NOW)).toEqual([
      { questId: "r1", title: "Prompt evals", originIdeaId: null },
      { questId: "r3", title: "Our proposal template", originIdeaId: "idea-1" },
    ]);
  });

  it("offers above the button only the fires lit from Hands; a fire grown from a learning is offered on that learning", () => {
    expect(handsFireOffers(heldFiresOf(raids, "host", sessions, new Set(), NOW)).map((f) => f.questId)).toEqual(["r1", "r4"]);
  });
});

describe("beaconFormError: what the form says before it sends, in the order it reads", () => {
  it.each<[string, string, string, string | null]>([
    ["both empty: the title first", "", "", BEACON_NO_TITLE],
    ["a title and no link", "Talk at the meetup", "  ", BEACON_NO_LINK],
    ["a link that is not one", "Talk at the meetup", "example.com/talk", BEACON_BAD_LINK],
    ["a javascript: link", "Talk", "javascript:alert(1)", BEACON_BAD_LINK],
    ["a title and an https link", "Talk at the meetup", "https://example.com/talk", null],
    ["an http link", "Talk", "http://example.com", null],
  ])("%s", (_, title, url, said) => {
    expect(beaconFormError(title, url)).toBe(said);
  });

  it("uses the ticket's two sentences", () => {
    expect(BEACON_NO_TITLE).toBe("Say what you put out.");
    expect(BEACON_NO_LINK).toBe("Add the link to the public thing.");
  });
});

describe("safeLink: only an http or https link is drawn as one", () => {
  it.each<[string | null, string | null]>([
    ["https://example.com/a", "https://example.com/a"],
    ["  HTTP://example.com  ", "HTTP://example.com"],
    ["javascript:alert(1)", null],
    ["data:text/html,hi", null],
    ["https://", null],
    ["https:// example.com", null],
    [null, null],
  ])("%s", (url, drawn) => {
    expect(safeLink(url)).toBe(drawn);
  });
});

describe("the horizon", () => {
  const rows: BeaconRow[] = [
    { id: "b2", title: "The digest that writes itself", giver_id: "mai", lit_url: "https://example.com/digest", created_at: "2026-10-22T03:00:00Z" },
    { id: "b1", title: "Talk at the meetup", giver_id: "me", lit_url: "https://example.com/talk", created_at: "2026-10-20T03:00:00Z" },
    { id: "b3", title: "Odd link", giver_id: "lan", lit_url: "ftp://example.com", created_at: "2026-10-23T03:00:00Z" },
  ];
  const names = new Map([
    ["mai", "Mai Tran"],
    ["me", "Kim Dao"],
  ]);

  it("stands the Beacons in the order they were lit, each with its author, and says You for the reader's own", () => {
    const lit = shapeLit(rows, names, "me");
    expect(lit.map((b) => b.questId)).toEqual(["b1", "b2", "b3"]);
    expect(lit[0]).toEqual({ questId: "b1", title: "Talk at the meetup", url: "https://example.com/talk", author: { personId: "me", name: "Kim Dao", initials: "KD" }, mine: true });
    expect(lit[1].mine).toBe(false);
    // A name the people read did not return is "Someone"; a link that is not http(s) is not drawn.
    expect(lit[2]).toMatchObject({ author: { name: "Someone" }, url: null });
  });

  it.each<[number, number, string]>([
    [0, 1, "c"],
    [0, 2, "c"],
    [0, 3, "l"],
    [1, 3, "c"],
    [2, 3, "r"],
    [0, 5, "l"],
    [2, 5, "c"],
    [4, 5, "r"],
  ])("the card of lighthouse %i of %i opens %s", (i, n, side) => {
    expect(tipSide(i, n)).toBe(side);
  });
});
