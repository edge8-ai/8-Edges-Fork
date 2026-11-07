import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// W.141: a card opened by CLICK had its first edit wiped once per page load.
// The environment has no DOM, so React's hooks are replaced by numbered slots
// and effects run the way React runs them: after a render, in declaration
// order, and only when a dependency changed identity.

const refs: { current: unknown }[] = [];
const effectDeps: unknown[][] = [];
let cursor = 0;
let effectCursor = 0;
let queued: (() => void)[] = [];
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (init: unknown) => {
    const i = cursor++;
    if (!(i in refs)) refs[i] = { current: init };
    return refs[i];
  },
  useEffect: (fn: () => void, deps: unknown[]) => {
    const i = effectCursor++;
    const prev = effectDeps[i];
    if (!prev || deps.some((d, k) => !Object.is(d, prev[k]))) queued.push(fn);
    effectDeps[i] = deps;
  },
}));

// The router's view of the address. Next 14.2 keeps useSearchParams in step with
// history.replaceState, but only from the NEXT render, which is what reading
// `search` at call time reproduces: a render sees the address as it was when it
// began, and a replaceState made by its effects shows up one render later.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

// Imported under another name: the hook runs outside React here, and the
// rules-of-hooks lint would read plain calls to `use…` as hook calls.
import { useCardDeepLink as deepLink } from "./useCardDeepLink";

let search = "";
const card = { id: "11111111-2222-3333-4444-555555555555", title: "Fix the drawer", laneId: "To do" } as never;
const other = { id: "99999999-2222-3333-4444-555555555555", title: "Ship the palette", laneId: "To do" } as never;
const cards = [card, other];

/** One render of the board, then its effects, as React commits them. */
function render(activeCard: unknown, openCard: (c: unknown) => void) {
  cursor = 0;
  effectCursor = 0;
  queued = [];
  deepLink(cards, openCard as never, activeCard as never);
  for (const run of queued) run();
}

beforeEach(() => {
  refs.length = 0;
  effectDeps.length = 0;
  search = "";
  vi.stubGlobal("window", {
    location: {
      get search() {
        return search;
      },
      get href() {
        return `https://os.example/admin/boards/b${search}`;
      },
    },
    history: {
      replaceState: (_s: unknown, _t: string, url: URL) => {
        search = url.search;
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useCardDeepLink", () => {
  it("never re-opens a card the person opened by click, so their first edit stands", () => {
    const opened: unknown[] = [];
    // Every render hands the hook a new openCard, as useCardForm does.
    const openCard = () => (c: unknown) => opened.push(c);
    render(null, openCard()); // the board loads with no ?card=
    render(card, openCard()); // a click opens the card; ?card= is written
    expect(search).toContain("card=");
    render(card, openCard()); // the first keystroke re-renders the board
    render(card, openCard());
    expect(opened).toEqual([]);
  });

  it("still opens the card a pasted link names, once", () => {
    search = "?card=11111111-2222-3333-4444-555555555555";
    const opened: unknown[] = [];
    const openCard = () => (c: unknown) => opened.push(c);
    render(null, openCard());
    render(card, openCard());
    render(card, openCard());
    expect(opened).toHaveLength(1);
  });

  // S.1: the search palette opens a card by pushing ?card= onto the board the
  // person may already be on. The board stays mounted through that navigation,
  // so the link has to open the card then too, not only on first load.
  it("opens the card a later link names while another card is open", () => {
    const opened: { id: string }[] = [];
    const openCard = () => (c: unknown) => opened.push(c as { id: string });
    render(null, openCard());
    render(card, openCard()); // a card opened by click; ?card= now names it
    search = "?card=99999999-2222-3333-4444-555555555555"; // the palette navigates
    render(card, openCard());
    expect(opened.map((c) => c.id)).toEqual(["99999999-2222-3333-4444-555555555555"]);
  });

  it("opens the card a later link names after an earlier card was opened and closed", () => {
    const opened: { id: string }[] = [];
    const openCard = () => (c: unknown) => opened.push(c as { id: string });
    render(null, openCard());
    render(card, openCard());
    render(null, openCard()); // closed; ?card= cleared
    render(null, openCard());
    search = "?card=99999999-2222-3333-4444-555555555555";
    render(null, openCard());
    expect(opened.map((c) => c.id)).toEqual(["99999999-2222-3333-4444-555555555555"]);
  });

  it("does not reopen a card in the render where it closes, before the address catches up", () => {
    const opened: unknown[] = [];
    const openCard = () => (c: unknown) => opened.push(c);
    render(null, openCard());
    render(card, openCard()); // ?card= written for it
    render(card, openCard()); // the router now sees ?card=<this card>
    render(null, openCard()); // closed; this render still sees the old ?card=
    render(null, openCard());
    expect(opened).toEqual([]);
    expect(search).not.toContain("card=");
  });

  it("clears ?card= when the drawer closes", () => {
    const openCard = () => () => {};
    render(null, openCard());
    render(card, openCard());
    render(null, openCard());
    expect(search).not.toContain("card=");
  });
});
