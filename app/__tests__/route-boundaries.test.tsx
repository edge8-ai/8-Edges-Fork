// E8-14 — error / not-found boundaries for the site root and the three
// dashboards.
//
// The point of these boundaries is not that the components exist; it is that a
// thrown error or a notFound() replaces only the page body and leaves the
// dashboard shell — sidebar included — standing. So the tests below render each
// boundary *as the segment layout's children*, exactly the way the App Router
// composes them, and assert the sidebar is in the resulting markup. Asserting a
// class name the boundary writes on itself would prove nothing: deleting
// <AdminSidebar/> from the layout would not change it.
//
// Collected by the root vitest.config.ts (`app/**/*.test.{ts,tsx}`), so
// `npm test` and CI run it.
import { describe, expect, it, vi } from "vitest";
import { createElement, type JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --- stubs for everything the layouts touch that is NOT under test ----------
// The sidebars themselves are deliberately NOT stubbed: they are the thing
// being asserted.
// Importing through the entity door builds the service-role Supabase client at
// module load; on CI's Node 20 its realtime layer throws without a WebSocket
// polyfill. This test never touches the database, so the client is stubbed.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`unexpected redirect to ${url}`);
  },
  notFound: () => {
    throw new Error("unexpected notFound()");
  },
}));
vi.mock("@/kernel/identity/team-auth", () => ({
  hasTeamAccess: async () => true,
  requireTeamMember: async () => ({
    personId: "person-1",
    displayName: "Mai",
    greeting: "Mai",
    email: "member@example.com",
    avatarUrl: null,
    role: "member",
    isAdmin: false,
  }),
}));
vi.mock("@/entities/retreats/avatars", () => ({ avatarUrlForAuthUser: async () => null }));
// The admin layout takes its privileged-user check from the assistant entity's
// index (ME-08). Stubbing the whole index also keeps the entity's Postgres and
// Anthropic clients out of this render.
vi.mock("@/entities/assistant", () => ({ isPrivilegedChatUser: () => false, AdminAssistant: () => null }));
// The generated shell module: what the layouts take from optional entities. The
// fallbacks are what a deployment without those entities would get, which is
// exactly the shape a boundary test wants.
vi.mock("@/app/shell", async () => {
  const React = await import("react");
  return {
    AdminAssistant: null,
    INBOX_HREF: null,
    avatarUrlForAuthUser: async () => null,
    SiteFrame: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    SITE_TITLE: "",
    SITE_DESCRIPTION: "",
    SITE_NAME: "",
    LOGO_SRC: "",
  };
});
vi.mock("@/entities/coaching", () => ({ canManageRoster: async () => false }));
// The team layout keeps a sidebar row only for a page the viewer may open
// (ADR 0013); this test is about the boundaries, so every row is allowed.
vi.mock("@/kernel/identity/access-request", () => ({
  getAccess: async () => ({ roles: [], permissions: () => [], may: () => true }),
  // Both layouts enter their surface by its atom (ADR 0014).
  requirePermission: async () => ({ roles: [], permissions: () => [], may: () => true, user: { id: "admin-1", email: "admin@example.com" }, personId: null }),
  // A portal page's guard hands back the portal actor (AC.14); the same one.
  requirePortalPermission: async () => (await import("@/kernel/identity/portal-auth")).requirePortalMember(),
}));
vi.mock("@/entities/team/lib/hub-clients", () => ({ hasClientAssignments: async () => false }));
vi.mock("@/entities/team/lib/hiring", () => ({ isHiringManager: async () => false }));
vi.mock("@/kernel/identity/portal-auth", () => ({
  requirePortalMember: async () => ({
    authUserId: "auth-1",
    personId: "person-2",
    displayName: "Client User",
    greeting: "Client",
    email: "client@example.com",
    companyScope: ["company-1"],
    memberships: [{ companyId: "company-1", companyName: "Acme", role: "member" }],
    impersonation: null,
    mustChangePassword: false,
  }),
}));
vi.mock("@/entities/portal/lib/team", () => ({ hasAssignedStaff: async () => false }));
vi.mock("@/entities/portal/lib/invoices", () => ({ hasInvoices: async () => false }));
vi.mock("@/entities/portal/lib/roles", () => ({ adminCompanyScope: () => [] }));
vi.mock("@/entities/portal/lib/meetings", () => ({ hasMeetings: async () => false }));
vi.mock("@/entities/portal/lib/boards", () => ({ hasBoard: async () => false }));
vi.mock("@/entities/portal/lib/backlog", () => ({ hasBacklog: async () => false }));
vi.mock("@/entities/portal/lib/ai-programs", () => ({ listProgramNamesForActor: async () => [] }));
vi.mock("@/entities/company-os/ui/AdminChatWidget", () => ({ AdminChatWidget: () => null }));
vi.mock("@/entities/team/ui/TeamChatWidget", () => ({ TeamChatWidget: () => null }));
// Server actions: the sidebars import them for their sign-out form.
vi.mock("@/entities/company-os/lib/actions", () => ({ signOut: async () => {} }));
vi.mock("@/entities/team/lib/actions", () => ({ signOut: async () => {} }));
vi.mock("@/entities/portal/lib/actions", () => ({
  signOut: async () => {},
  endAssumeSession: async () => {},
}));

import RootError from "../error";
import RootNotFound from "../not-found";
import AdminLayout from "../admin/(dashboard)/layout";
import AdminError from "../admin/(dashboard)/error";
import AdminNotFound from "../admin/(dashboard)/not-found";
import TeamLayout from "../team/(dashboard)/layout";
import TeamError from "../team/(dashboard)/error";
import TeamNotFound from "../team/(dashboard)/not-found";
import PortalLayout from "../portal/(dashboard)/layout";
import PortalError from "../portal/(dashboard)/error";
import PortalNotFound from "../portal/(dashboard)/not-found";

type ErrorBoundary = (props: { error: Error & { digest?: string }; reset: () => void }) => JSX.Element;
type SegmentLayout = (props: { children: React.ReactNode }) => Promise<JSX.Element>;

const error = Object.assign(new Error("boom"), { digest: "digest-123" });

// The layouts are async server components, which renderToStaticMarkup cannot
// render directly; awaiting one yields the element tree the router would mount.
async function renderInShell(Layout: SegmentLayout, children: React.ReactNode) {
  return renderToStaticMarkup(await Layout({ children }));
}

// [segment, layout, error boundary, not-found boundary, the sidebar's own
// aria-label, the link back to the segment root]
const dashboards: Array<
  [string, SegmentLayout, ErrorBoundary, () => JSX.Element, string, string]
> = [
  ["admin", AdminLayout as SegmentLayout, AdminError, AdminNotFound, 'aria-label="Admin"', 'href="/admin"'],
  ["team", TeamLayout as SegmentLayout, TeamError, TeamNotFound, 'aria-label="Team"', 'href="/team"'],
  ["portal", PortalLayout as SegmentLayout, PortalError, PortalNotFound, 'aria-label="Portal"', 'href="/portal"'],
];

describe.each(dashboards)(
  "%s (dashboard) boundaries render inside the real shell",
  (_segment, Layout, ErrorBoundaryComponent, NotFoundBoundary, sidebarLabel, rootHref) => {
    it("keeps the sidebar when the page body is an error boundary", async () => {
      const html = await renderInShell(
        Layout,
        createElement(ErrorBoundaryComponent, { error, reset: () => {} }),
      );
      // The shell and its sidebar — produced by the layout, not by the boundary.
      expect(html).toContain("admin-shell");
      expect(html).toContain("admin-sidebar");
      expect(html).toContain(sidebarLabel);
      // ...with the boundary in the body, not the page.
      expect(html).toMatch(/<h1[^>]*>Something went wrong<\/h1>/);
      expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
      expect(html).toContain("digest-123");
    });

    it("keeps the sidebar when the page body is the not-found boundary", async () => {
      const html = await renderInShell(Layout, createElement(NotFoundBoundary));
      expect(html).toContain("admin-shell");
      expect(html).toContain("admin-sidebar");
      expect(html).toContain(sidebarLabel);
      expect(html).toMatch(/<h1[^>]*>Not found<\/h1>/);
      expect(html).toContain(rootHref);
    });
  },
);

// --- AC3: notFound() actually resolves to the segment's not-found.tsx -------
// The App Router catches notFound() at the nearest not-found.tsx in the route's
// ancestor chain (route groups included). A [id] page that ends up outside the
// (dashboard) group falls through to app/not-found.tsx — the unstyled, sidebar-
// less site 404 — which is exactly what this criterion forbids. That is a
// property of where files sit, so the test computes the resolution the way Next
// does, over the real tree.
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Importing notFound from next/navigation is what distinguishes a real call
// site from a component that merely happens to be named `*NotFound()`.
const IMPORTS_NOT_FOUND = /import\s*\{[^}]*\bnotFound\b[^}]*\}\s*from\s*"next\/navigation"/;

const REPO_ROOT = path.resolve(APP_DIR, "..");
// A page that has moved into an entity (ME-07, ME-09, …) leaves a thin mount in
// app/ that re-exports the body. Where the file *sits* is still what decides
// which not-found.tsx catches it, so the walk below stays over app/; but the
// notFound() call itself now lives in the entity module, so read that instead.
const MOUNTS_ENTITY = /export\s*\{[^}]*\}\s*from\s*"(@\/entities\/[^"]+)"/;

/** The source that actually runs for a page.tsx, following a one-line mount. */
function pageBody(pagePath: string): string {
  const source = readFileSync(pagePath, "utf8");
  const mounted = MOUNTS_ENTITY.exec(source);
  if (!mounted) return source;
  const target = path.join(REPO_ROOT, `${mounted[1].slice(2)}.tsx`);
  return readFileSync(target, "utf8");
}

function pagesCallingNotFound(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__" || entry === "api") continue;
      pagesCallingNotFound(p, out);
    } else if (entry === "page.tsx" && IMPORTS_NOT_FOUND.test(pageBody(p))) {
      out.push(p);
    }
  }
  return out;
}

// Walk up from a page to the nearest ancestor directory holding not-found.tsx.
function resolveNotFoundBoundary(pagePath: string): string | null {
  let dir = path.dirname(pagePath);
  for (;;) {
    for (const candidate of readdirSync(dir)) {
      if (candidate === "not-found.tsx") return path.join(dir, candidate);
    }
    if (path.resolve(dir) === path.resolve(APP_DIR)) return null;
    dir = path.dirname(dir);
  }
}

describe("notFound() from a dashboard page resolves to that dashboard's not-found.tsx", () => {
  const pages = pagesCallingNotFound(APP_DIR);

  it("finds the dashboard pages that call notFound()", () => {
    // Guard the guard: if the scan finds nothing, the assertions below are vacuous.
    for (const segment of ["admin", "team", "portal"]) {
      const inSegment = pages.filter((p) => path.relative(APP_DIR, p).startsWith(`${segment}/`));
      expect(inSegment.length, `no ${segment} page calls notFound()`).toBeGreaterThan(0);
    }
  });

  it.each(["admin", "team", "portal"])(
    "every %s page that calls notFound() is caught by the (dashboard) boundary, not the site 404",
    (segment) => {
      const expected = path.join(APP_DIR, segment, "(dashboard)", "not-found.tsx");
      const wrong = pages
        .filter((p) => path.relative(APP_DIR, p).startsWith(`${segment}/`))
        .filter((p) => resolveNotFoundBoundary(p) !== expected)
        .map((p) => `${path.relative(APP_DIR, p)} → ${resolveNotFoundBoundary(p) ?? "app/not-found.tsx (site 404)"}`);
      expect(wrong).toEqual([]);
    },
  );
});

// --- the site-root boundaries ----------------------------------------------
describe("site root boundaries", () => {
  it("error.tsx renders a heading, the digest, and a Try again button", () => {
    const html = renderToStaticMarkup(createElement(RootError, { error, reset: () => {} }));
    expect(html).toMatch(/<h1[^>]*>Something went wrong<\/h1>/);
    expect(html).toContain("digest-123");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  it("not-found.tsx renders a heading and a link home", () => {
    const html = renderToStaticMarkup(createElement(RootNotFound));
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/);
    expect(html).toContain('href="/"');
  });
});
