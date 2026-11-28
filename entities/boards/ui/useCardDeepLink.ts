"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { cardSlug, isUuid, shortCode, shortOf } from "@/kernel/config/slug";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import type { Card } from "./board-view-types";

// Two-way sync between the open card and the browser URL (CU-01):
//  - open the card named by ?card=<slug>, so a shared link deep-links straight
//    to it. That holds on first load and on any later navigation that names a
//    card the board is not showing, such as the global search palette (S.1)
//    pushing ?card= onto the board the person is already on;
//  - whenever the open card changes, reflect it in the address bar as
//    ?card=<friendly-slug> (and clear it on close), via replaceState so the
//    board's own history stays clean.
// The param is the friendly name+short-code slug (e.g. "fix-login-bug-030b0f26");
// a bare uuid still resolves, since older links used it.
export function useCardDeepLink(cards: WorkboardCard[], openCard: (c: Card) => void, activeCard: WorkboardCard | null) {
  // The slug is derived here rather than passed in: it is the same fact as
  // the open card, and two places computing it is two places to disagree
  // about what a card's address is.
  const openParam = activeCard ? cardSlug(activeCard.title, activeCard.id) : null;
  // The router's ?card=, which Next keeps in step with replaceState from the
  // next render on.
  const linkParam = useSearchParams()?.get("card") ?? null;
  // The last ?card= value this board has already answered, either by opening the
  // card it names or by writing it for a card opened some other way. A link acts
  // only when it says something new. That is what keeps W.141 fixed: a card
  // opened by click writes its own ?card=, and reading that back must not
  // reopen it over the person's edit. It also covers the render where a card
  // closes: that render still sees the old ?card=, which is already answered.
  const answered = useRef<string | null>(null);
  useEffect(() => {
    if (!linkParam || linkParam === answered.current) return;
    const c = isUuid(linkParam)
      ? cards.find((x) => x.id === linkParam)
      : cards.find((x) => shortCode(x.id) === shortOf(linkParam));
    if (c) {
      answered.current = linkParam;
      openCard({ ...c, columnId: c.laneId });
    }
  }, [linkParam, cards, openCard]);

  useEffect(() => {
    answered.current = openParam;
    const url = new URL(window.location.href);
    if (openParam) url.searchParams.set("card", openParam);
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, [openParam]);
}
