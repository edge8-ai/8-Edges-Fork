import { describe, expect, it } from "vitest";
import { wireStaleRefresh } from "./stale-refresh";

// A minimal stand-in for window/document: records what was subscribed, lets a
// test fire an event, and proves cleanup actually unsubscribed. vitest runs in
// the `node` environment, so there is no real DOM to lean on.
function fakeTarget(visibilityState = "visible") {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  return {
    visibilityState,
    addEventListener(type: string, listener: (event: Event) => void) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string, event: Partial<PageTransitionEvent> = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event as Event);
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function setup(opts: { visibilityState?: string } = {}) {
  const win = fakeTarget();
  const doc = fakeTarget(opts.visibilityState ?? "visible");
  const refreshes: string[] = [];
  // The real `defer` yields a task so the router settles before the refresh
  // (see deferToNextTask). Here it is a queue the test drains by hand, which
  // keeps assertions synchronous and makes "was it cancelled?" observable.
  let queued: { fn: () => void; tag: string }[] = [];
  let tag = "";
  const cleanup = wireStaleRefresh({
    win,
    doc,
    refresh: () => {
      refreshes.push(tag);
    },
    defer: (fn) => {
      const entry = { fn, tag };
      queued.push(entry);
      return () => {
        queued = queued.filter((q) => q !== entry);
      };
    },
  });
  const drain = () => {
    const due = queued;
    queued = [];
    for (const q of due) {
      tag = q.tag;
      q.fn();
    }
  };
  return {
    win,
    doc,
    cleanup,
    drain,
    pending: () => queued.length,
    /** Fire an event, labelling any refresh it causes so bursts are legible. */
    fire: (target: "win" | "doc", type: string, label: string, event = {}) => {
      tag = label;
      (target === "win" ? win : doc).fire(type, event);
    },
    // Every assertion runs the deferred work first, so the tests read as
    // "fire the event, then check what happened".
    refreshes: () => {
      drain();
      return refreshes;
    },
    count: () => {
      drain();
      return refreshes.length;
    },
  };
}

describe("wireStaleRefresh", () => {
  // The case the one-line staleTimes fix could not reach: back/forward restores
  // a cached payload however stale it is, so the refresh has to be explicit.
  it("refreshes on popstate, which is how in-app back/forward arrives", () => {
    const h = setup();
    h.win.fire("popstate");
    expect(h.count()).toBe(1);
  });

  it("refreshes when the tab becomes visible again", () => {
    const h = setup();
    h.doc.fire("visibilitychange");
    expect(h.count()).toBe(1);
  });

  it("ignores visibilitychange when the tab is going away, not coming back", () => {
    const h = setup({ visibilityState: "hidden" });
    h.doc.fire("visibilitychange");
    expect(h.count()).toBe(0);
  });

  // An ordinary load already has a fresh payload; only a bfcache restore is
  // handing back a document that predates whatever happened while away.
  it("refreshes on pageshow only when the document came from the bfcache", () => {
    const h = setup();
    h.win.fire("pageshow", { persisted: false });
    expect(h.count()).toBe(0);
    h.win.fire("pageshow", { persisted: true });
    expect(h.count()).toBe(1);
  });

  // A bfcache restore fires both, milliseconds apart. One arrival, one refresh.
  it("collapses the pageshow + visibilitychange pair into one refresh", () => {
    const h = setup();
    h.win.fire("pageshow", { persisted: true });
    h.doc.fire("visibilitychange");
    expect(h.count()).toBe(1);
  });

  // REGRESSION, card 4b13dd13 review finding 6. The first version throttled on a
  // 2s window and kept the FIRST event of a burst, so holding Back through three
  // entries refreshed entry 1 and suppressed the rest — leaving the page the
  // user actually landed on stale, which is the case this module exists for.
  // Keeping the LAST event is what makes the landing entry the one refreshed.
  it("refreshes the entry the user lands on when Back is held through several", () => {
    const h = setup();
    h.fire("win", "popstate", "back-1");
    h.fire("win", "popstate", "back-2");
    h.fire("win", "popstate", "back-3");
    expect(h.refreshes()).toEqual(["back-3"]);
  });

  // The burst collapses, but separated events must each get their own refresh:
  // once a deferral has run there is nothing left to cancel.
  it("refreshes again for an event that arrives after the previous one ran", () => {
    const h = setup();
    h.fire("win", "popstate", "first");
    h.drain();
    h.fire("win", "popstate", "second");
    expect(h.refreshes()).toEqual(["first", "second"]);
  });

  // The refresh is deferred rather than immediate because popstate fires while
  // the router is still switching entries: a synchronous refresh asked for the
  // route being LEFT and the restored one kept its stale payload.
  it("defers the refresh instead of running it inside the event handler", () => {
    const h = setup();
    h.win.fire("popstate");
    expect(h.pending()).toBe(1);
  });

  it("removes every listener it added on cleanup", () => {
    const h = setup();
    h.cleanup();
    expect(h.win.count("popstate")).toBe(0);
    expect(h.win.count("pageshow")).toBe(0);
    expect(h.doc.count("visibilitychange")).toBe(0);
    h.win.fire("popstate");
    expect(h.count()).toBe(0);
  });

  // Otherwise unmounting mid-navigation lands a refresh on whatever route the
  // user reached next.
  it("cancels a deferred refresh when cleaned up before it runs", () => {
    const h = setup();
    h.win.fire("popstate");
    h.cleanup();
    expect(h.count()).toBe(0);
  });
});
