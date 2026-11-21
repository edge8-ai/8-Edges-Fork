import type { MouseEvent } from "react";

/**
 * A row's link on the team Inbox (TH.8), as InboxLineItem's: a plain click
 * marks the row read FIRST and then opens it, because a plain link would leave
 * the page while the mark was still in flight and lose it. A modified click
 * (a new tab) is left to the browser.
 */
export function openWith(href: string | null, onOpen: (href: string) => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (!href || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(href);
  };
}
