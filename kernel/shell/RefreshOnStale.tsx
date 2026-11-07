"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { wireStaleRefresh } from "./stale-refresh";

// Every authenticated page is `force-dynamic`, so the SERVER always re-renders
// when it is asked. The bug this component exists for is that the browser often
// does not ask: Next keeps an in-memory Client Router Cache of RSC payloads per
// tab, and three cases serve a stale one no matter what the server does.
//
// Measured on a production build for card 4b13dd13 (18 Sep 2026):
//
//   - A soft navigation away and back re-used a payload 21 seconds old on a
//     force-dynamic page. That one is fixed by `staleTimes.dynamic: 0` in
//     next.config.mjs, the companion half of this fix.
//   - Back/forward re-used a payload 38 seconds old — PAST the stale window —
//     because back/forward restores from the cache unconditionally, to keep
//     scroll position and client state. No config value changes that, which is
//     why the one-line fix was not enough on its own.
//   - A row written by something this tab never saw (the htt-sync-prs cron
//     creates the client companies; an admin writing from another surface)
//     cannot invalidate anything here: `revalidatePath` runs on the server and
//     there is no server-to-client push. Only asking again reveals it.
//
// A further trap the same measurements ruled out: `revalidatePath` reaches this
// cache only when it runs inside a SERVER ACTION. The identical call in a route
// handler does not, so a component that mutates through `fetch('/api/...')`
// leaves the list stale even though the write succeeded and the code appears to
// invalidate it.
//
// `router.refresh()` re-fetches the current route's payload and re-renders its
// server components in place. React state in client components survives, so an
// open drawer stays open and a half-typed form keeps its text.
//
// The listeners live in stale-refresh.ts so they can be tested without a DOM.
export function RefreshOnStale() {
  const router = useRouter();

  useEffect(
    () => wireStaleRefresh({ win: window, doc: document, refresh: () => router.refresh() }),
    [router],
  );

  return null;
}
