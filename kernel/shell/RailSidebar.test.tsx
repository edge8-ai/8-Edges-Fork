import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ORG_NAME } from "@/kernel/config/organisation";
import { appViews } from "./app-views";
import type { NavGroup } from "./nav";
import { RailSidebar } from "./RailSidebar";

// The sidebar every signed-in staff shell draws (TH.29): one column of the
// app's pages under the mark, the account row pinned at its foot, and the pull
// tab that folds it to icons.
const groups: NavGroup[] = [
  { label: null, items: [{ label: "Home", href: "/team", ico: "", icon: "home", enabled: true }] },
  {
    label: "My Work",
    items: [
      { label: "Board", href: "/team/workboard", ico: "", icon: "board", enabled: true },
      { label: "Inbox", href: "/team/inbox", ico: "", icon: "inbox", enabled: true },
    ],
  },
];

const render = ({
  folded = false,
  here = "/team",
  admin = false,
  border = null,
  avatarUrl = null,
  counts = {},
  // A sample address with no extension: the design check reads any src ending in
  // one as a file public/ must hold, and the fork does not ship the real mark.
  mark = "/sample-mark",
}: { folded?: boolean; here?: string; admin?: boolean; border?: string | null; avatarUrl?: string | null; counts?: Record<string, number>; mark?: string | null } = {}) =>
  renderToStaticMarkup(
    <RailSidebar
      label="Team"
      views={appViews("team", { admin, client: admin ? "/admin/client-hubs" : null })}
      name="Sam Rivera"
      email="sam@example.test"
      profileHref="/team/profile"
      mark={mark}
      avatarUrl={avatarUrl}
      border={border}
      signOut={async () => {}}
      groups={groups}
      groupIcons={{ "My Work": "myWeek" }}
      here={(href) => href === here}
      countFor={(href) => counts[href] ?? 0}
      initialFolded={folded}
      navOpen={false}
      closeNav={() => {}}
    >
      <div className="open-tree">the open tree</div>
    </RailSidebar>,
  );

describe("the one-column sidebar", () => {
  it("draws no app rail: the apps are in the account menu, behind the row at the foot", () => {
    const html = render({ admin: true });
    expect(html).not.toContain("shell-rail");
    expect(html).not.toContain("shell-app");
    expect(html).toMatch(/<div class="shell-foot">.*class="shell-account"[^>]*aria-haspopup="menu" aria-expanded="false" aria-label="Your account"/);
    expect(html).toContain("sam@example.test");
  });

  it("draws the open panel with the mark beside the app's name, its tree, and a tab that collapses it", () => {
    const html = render();
    expect(html).toContain('class="admin-sidebar shell-side"');
    expect(html).toMatch(/<nav class="shell-panel-wide" aria-label="Team">/);
    expect(html).toContain('class="admin-brand-lead"><img class="shell-mark" src="/sample-mark" alt=""/>Team<');
    expect(html).toContain("the open tree");
    expect(html).toMatch(/class="shell-edge" aria-label="Collapse sidebar" aria-expanded="true"/);
  });

  it("draws the name alone where the build has no mark (the public fork)", () => {
    const html = render({ mark: null });
    expect(html).toContain('class="admin-brand-lead">Team<');
    expect(html).not.toContain("shell-mark");
  });

  it("folded, hides nothing: each top row keeps an icon, each group is one icon, and the tab expands it", () => {
    const html = render({ folded: true });
    expect(html).toContain('class="admin-sidebar shell-side is-folded"');
    expect(html).not.toContain("the open tree");
    expect(html).toMatch(/<a class="shell-fold-btn is-active"[^>]*aria-label="Home"/);
    expect(html).toMatch(/<button[^>]*class="shell-fold-btn"[^>]*aria-label="My Work"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/class="shell-edge" aria-label="Expand sidebar" aria-expanded="false"/);
  });

  it("folded, keeps the mark on top and the face alone at the foot", () => {
    const html = render({ folded: true });
    // Alone, it names the organisation from its config, never from code; unset, as in a fork, it is decoration.
    expect(html).toContain(`<img class="shell-mark" src="/sample-mark" alt="${ORG_NAME ?? ""}"/>`);
    expect(html).toMatch(/class="shell-account is-compact"[^>]*aria-label="Your account"/);
    expect(html).not.toContain("sam@example.test");
  });

  it("folded, names every icon in a tooltip and counts a group's pages", () => {
    const html = render({ folded: true });
    expect(html).toMatch(/class="shell-tip" aria-hidden="true">Home</);
    expect(html).toMatch(/class="shell-tip" aria-hidden="true">My Work<span class="shell-tip-sub">2 pages</);
  });

  it("lights the group holding the page you are on", () => {
    expect(render({ folded: true, here: "/team/inbox" })).toMatch(/class="shell-fold-btn is-active"[^>]*aria-label="My Work"/);
  });

  // TH.8: what waits on the person stays on the folded icon, and is heard as a phrase.
  it("folded, keeps a row's count on its group's icon", () => {
    const html = render({ folded: true, counts: { "/team/inbox": 3 } });
    expect(html).toMatch(/aria-label="My Work, 3 waiting on you"/);
    expect(html).toContain('class="shell-fold-count" aria-hidden="true">3<');
    expect(render({ folded: true })).not.toContain("shell-fold-count");
  });

  // LD.4: the reader's own face at the foot wears the border they chose to show.
  it("wears the reader's border on the face at the foot", () => {
    const html = render({ border: "gold" });
    expect(html).toContain('class="admin-face-frame frame-gold"');
    expect(html).toContain(">SR<");
  });
});
