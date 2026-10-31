import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountControl } from "./AccountControl";
import { AccountMenu } from "./AccountMenu";
import { appViews, type AppView } from "./app-views";

// The account at the sidebar's foot (TH.29): a row naming who is signed in,
// whose menu switches app, opens the profile and signs out.
const admin = appViews("team", { admin: true, client: "/admin/client-hubs" });
const member = appViews("team", { admin: false, client: null });

const menu = ({ views = admin, profileHref = "/team/profile" as string | null, signOutLabel }: { views?: AppView[]; profileHref?: string | null; signOutLabel?: string } = {}) =>
  renderToStaticMarkup(
    <AccountMenu
      name="Sample Tester"
      subline="sample@example.test"
      face="ST"
      views={views}
      profileHref={profileHref}
      signOut={async () => {}}
      signOutLabel={signOutLabel}
      onClose={() => {}}
    />,
  );

describe("the account menu", () => {
  it("says who is signed in", () => {
    const html = menu();
    expect(html).toContain("Sample Tester");
    expect(html).toContain("sample@example.test");
  });

  it("switches between the apps you may enter, ticking the one you are in", () => {
    const html = menu();
    expect(html).toContain(">Switch app<");
    expect(html).toMatch(/<a[^>]*role="menuitem"[^>]*aria-current="true"[^>]*href="\/team"[^>]*>.*?Team.*?shell-account-tick/);
    expect(html).toMatch(/<a[^>]*role="menuitem"[^>]*href="\/admin"/);
    expect(html).toMatch(/<a[^>]*role="menuitem"[^>]*href="\/admin\/client-hubs"[^>]*>.*?Client Hub/);
  });

  it("draws no Switch app for someone with one app", () => {
    const html = menu({ views: member });
    expect(html).not.toContain("Switch app");
    expect(html).not.toContain('href="/admin"');
  });

  it("opens the profile, and leaves the row out when there is no profile to open", () => {
    expect(menu()).toMatch(/<a[^>]*role="menuitem"[^>]*href="\/team\/profile"[^>]*>.*?View profile/);
    expect(menu({ profileHref: null })).not.toContain("View profile");
  });

  it("makes every item a menu item reached by the arrow keys, Sign out last", () => {
    const html = menu();
    expect(html).toMatch(/role="menu"[^>]*aria-label="Your account"/);
    const items = html.match(/role="menuitem"[^>]*/g) ?? [];
    expect(items).toHaveLength(5);
    for (const item of items) expect(item).toContain('tabindex="-1"');
    // React appends its form-replay script after a server-rendered form, so the
    // menu's end is read up to its own closing tag.
    expect(html).toMatch(/<button[^>]*role="menuitem"[^>]*>.*?Sign out<\/span><\/button><\/form><\/div>(<script>|$)/);
  });

  it("ends an Assume session rather than signing the admin out", () => {
    expect(menu({ signOutLabel: "Exit assume mode" })).toContain("Exit assume mode");
  });
});

const control = ({ compact = false, border = null, avatarUrl = null }: { compact?: boolean; border?: string | null; avatarUrl?: string | null } = {}) =>
  renderToStaticMarkup(
    <AccountControl
      name="Sam Rivera"
      email="sam@example.test"
      avatarUrl={avatarUrl}
      border={border}
      views={admin}
      profileHref="/team/profile"
      signOut={async () => {}}
      compact={compact}
    />,
  );

describe("the account row", () => {
  it("names who is signed in beside their face, closed until pressed", () => {
    const html = control();
    expect(html).toMatch(/<button type="button" class="shell-account"[^>]*aria-haspopup="menu" aria-expanded="false" aria-label="Your account"/);
    expect(html).toContain(">SR<");
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("sam@example.test");
    expect(html).not.toContain('role="menu"');
  });

  it("folded, is the face alone", () => {
    const html = control({ compact: true });
    expect(html).toMatch(/class="shell-account is-compact"/);
    expect(html).not.toContain("sam@example.test");
    expect(html).toContain('aria-label="Your account"');
  });

  // LD.4: the reader's own face wears the border they chose to show.
  it("wears the reader's border round their photo", () => {
    const html = control({ border: "silver", avatarUrl: "https://cdn.example/sam.jpg" });
    expect(html).toContain('<img class="admin-face-photo" src="https://cdn.example/sam.jpg" alt=""/>');
    expect(html).toContain("frame-silver");
    expect(html).not.toContain('role="img" aria-label="Sam Rivera"');
  });
});
