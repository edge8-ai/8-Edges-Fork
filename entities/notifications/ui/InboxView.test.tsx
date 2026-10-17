import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// S.3, TH.2. The inbox at rest: what needs the person first, each request with
// one action and a Done check; with nothing waiting it says so in words, and
// the settings show direct requests as always on.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

import { InboxView, type InboxActions } from "./InboxView";
import type { InboxDay, InboxRow } from "./inbox-rows";

const ok = async () => ({ ok: true as const });
const actions: InboxActions = { markRead: ok, markAllRead: ok, markDone: ok, undoDone: ok, setMuted: ok, setLarkEcho: ok };
const prefs = [
  { kind: "card.assigned", label: "Someone assigns you a card", muted: false, alwaysOn: true },
  { kind: "deal.won", label: "A deal you own is won", muted: true, alwaysOn: false },
];

const request: InboxRow = {
  ids: ["n1"],
  kind: "card.assigned",
  icon: "columns",
  title: "Derek assigned you “Ship it”",
  body: "Handover: the list is on the card.",
  href: "/team/boards/b?card=t1",
  when: "12m ago",
  bundle: null,
  unread: true,
  done: false,
  action: "Open card",
  subject: null,
  face: null,
};

function render(needs: InboxRow[], days: InboxDay[], myWeekHref: string | null = "/team/my-week") {
  return renderToStaticMarkup(<InboxView needs={needs} days={days} prefs={prefs} larkEcho myWeekHref={myWeekHref} actions={actions} />);
}

describe("InboxView", () => {
  it("says nothing is waiting in words, points at My week, and offers no Mark all read", () => {
    const html = render([], []);
    expect(html).toContain("Nothing is waiting on you.");
    expect(html).toContain('href="/team/my-week"');
    expect(html).toContain("All done");
    expect(html).not.toContain("Mark all read");
  });

  it("leaves My week out where the page has none", () => {
    expect(render([], [], null)).not.toContain("My week");
  });

  it("lists a request with its link, the handover note, one action and a Done check", () => {
    const html = render([request], []);
    expect(html).toContain('href="/team/boards/b?card=t1"');
    expect(html).toContain("Handover: the list is on the card.");
    expect(html).toContain(">Open card<");
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain("1 to do, 1 new");
  });

  it("groups what happened by day, offers Mark all read while something is unread, and tags a done request", () => {
    const happened: InboxRow = { ...request, ids: ["n2"], done: true, unread: false, bundle: "3 comments on this card, newest shown" };
    const unread: InboxRow = { ...request, ids: ["n3"], kind: "kudos.received", icon: "spark", title: "Lan sent you kudos" };
    const html = render([], [{ label: "Today", rows: [happened, unread] }]);
    expect(html).toContain(">Today<");
    expect(html).toContain("Mark all read");
    expect(html).toContain(">Done<");
    expect(html).toContain("3 comments on this card, newest shown");
  });

  it("shows assignments as always on, a muted kind unticked, and the Lark switch on", () => {
    const html = render([], []);
    expect(html).toContain("Always on");
    expect(html).toMatch(/A deal you own is won<\/span><input type="checkbox"(?![^>]*checked)[^>]*>/);
    expect(html).toMatch(/Also send work notices to Lark[\s\S]*?<input type="checkbox" checked=""/);
  });
});
