import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// S.3. The inbox at rest: what is waiting comes first with a way to mark it
// read, and with nothing waiting it says so in words, not as an empty list.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

import { InboxView, type InboxActions } from "./InboxView";

const actions: InboxActions = {
  markRead: async () => ({ ok: true }),
  markAllRead: async () => ({ ok: true }),
  setMuted: async () => ({ ok: true }),
};
const prefs = [{ kind: "deal.won", label: "A deal you own is won", muted: true }];

describe("InboxView", () => {
  it("says nothing has changed when nothing is waiting, and offers no Mark all read", () => {
    const html = renderToStaticMarkup(<InboxView unread={[]} read={[]} prefs={prefs} actions={actions} />);
    expect(html).toContain("Nothing has changed on your work since you last looked.");
    expect(html).not.toContain("Mark all read");
  });

  it("lists what is waiting with its link and a Mark read, and shows a muted kind unticked", () => {
    const unread = [{ id: "n1", title: "“Ship it” was finished", body: null, href: "/team/boards/b?card=t1", when: "3h ago" }];
    const html = renderToStaticMarkup(<InboxView unread={unread} read={[]} prefs={prefs} actions={actions} />);
    expect(html).toContain('href="/team/boards/b?card=t1"');
    expect(html).toContain("Mark read");
    expect(html).toContain("Mark all read");
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*>/);
  });
});
