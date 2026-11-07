// The listener wiring behind RefreshOnStale.tsx, kept separate from the
// component so it can be tested. vitest runs in the `node` environment with no
// jsdom, so a hook's effect never fires under test; a function that takes its
// window and document as arguments can be driven by fakes instead, which is
// what stale-refresh.test.ts does. The component is then thin enough to read in
// one screen and holds no logic worth testing on its own.
//
// Why each event is here, and what it costs if it is removed, is written up in
// RefreshOnStale.tsx.

/**
 * The slice of `window` this needs; a fake in tests, the real one in the app.
 * Written in method shorthand rather than as arrow properties on purpose:
 * shorthand is bivariant in its parameters, which is what lets the real
 * `window` — whose overloads take the much wider `EventListenerOrEventListener
 * Object` — satisfy this narrower shape.
 */
export type ListenerTarget = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export type StaleRefreshOptions = {
  win: ListenerTarget;
  /** Read at event time, not at wiring time: visibility is what changed. */
  doc: ListenerTarget & { readonly visibilityState: string };
  refresh: () => void;
  /**
   * Runs `fn` after the current task, returning a cancel. Injected so tests can
   * drive it by hand; see `deferToNextTask` for why the default is not immediate.
   */
  defer?: (fn: () => void) => () => void;
};

// `popstate` fires while the router is still switching history entries, so a
// refresh issued synchronously from the handler asks for the route being LEFT.
// Measured on the production build for card 4b13dd13: pressing Back on the
// probe's add page sent `GET /cache-probe/add/?_rsc=...` — the outgoing route —
// and the restored list kept its stale payload. Yielding one task lets the
// router settle on the entry it is restoring, so the refresh targets that.
export const deferToNextTask = (fn: () => void): (() => void) => {
  const handle = setTimeout(fn, 0);
  return () => clearTimeout(handle);
};

/**
 * Calls `refresh` when the tab comes back to a route whose cached payload may
 * be stale. Returns the cleanup that removes every listener it added.
 */
export function wireStaleRefresh({
  win,
  doc,
  refresh,
  defer = deferToNextTask,
}: StaleRefreshOptions): () => void {
  let cancelPending: (() => void) | null = null;

  // Collapses a burst by keeping only the LAST event's refresh, rather than the
  // first. Two bursts matter and they want opposite halves of a time window,
  // which is why there is no time window:
  //
  //   - A bfcache restore fires pageshow and visibilitychange milliseconds
  //     apart. One arrival deserves one refresh.
  //   - Holding Back through several history entries fires a popstate each. The
  //     only render worth paying for is the entry the user stops on.
  //
  // An earlier version used a 2s throttle and kept the FIRST event instead. It
  // got the bfcache pair right and the second case exactly wrong: three Backs
  // inside the window refreshed the first restored entry and suppressed the
  // rest, so the page the user actually landed on kept its stale payload — the
  // very case this module exists for. Cancelling and rescheduling needs no
  // window, because "the last event wins" is true at any spacing: a later event
  // whose predecessor has already run finds nothing to cancel and simply
  // schedules its own refresh.
  const schedule = () => {
    cancelPending?.();
    cancelPending = defer(() => {
      cancelPending = null;
      refresh();
    });
  };

  const onVisibility = () => {
    // Going away is not interesting; only coming back can reveal new rows.
    if (doc.visibilityState === "visible") schedule();
  };

  // `persisted` distinguishes a bfcache restore from an ordinary load. An
  // ordinary load already carries a fresh payload, so refreshing there would
  // buy nothing and cost a second round trip on every arrival.
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) schedule();
  };

  win.addEventListener("popstate", schedule);
  win.addEventListener("pageshow", onPageShow);
  doc.addEventListener("visibilitychange", onVisibility);

  return () => {
    // A deferral outliving the component would call router.refresh() after
    // unmount, on whatever route the user has since navigated to.
    cancelPending?.();
    cancelPending = null;
    win.removeEventListener("popstate", schedule);
    win.removeEventListener("pageshow", onPageShow);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
