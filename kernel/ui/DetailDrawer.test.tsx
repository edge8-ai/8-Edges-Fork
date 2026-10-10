import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailDrawer } from "./DetailDrawer";

// S.4 gives the drawer an optional History panel, which is the one way a record's
// audit trail reaches a screen. Two things have to stay true and neither is
// visible to the type checker: a drawer that was not given a history must look
// exactly as it did before (twenty-four callers pass no history), and a drawer
// that was given one must still open on the details rather than on the history.

const tabTags = (html: string) => [...html.matchAll(/<button[^>]*role="tab"[^>]*>[^<]*/g)].map((m) => m[0]);

describe("DetailDrawer · the optional History panel", () => {
  it("renders the body as it always did when no history is given", () => {
    const html = renderToStaticMarkup(
      <DetailDrawer open onClose={() => {}} title="Accord Plumbing">
        <p>the details</p>
      </DetailDrawer>,
    );

    expect(html).toContain("<p>the details</p>");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });

  it("offers Details and History, and opens on the details", () => {
    const html = renderToStaticMarkup(
      <DetailDrawer open onClose={() => {}} title="Accord Plumbing" history={<p>the history</p>}>
        <p>the details</p>
      </DetailDrawer>,
    );

    const tabs = tabTags(html);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toContain("Details");
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[1]).toContain("History");
    expect(tabs[1]).toContain('aria-selected="false"');
    // Only the open panel renders, so the history's loader does not run until
    // somebody asks for it.
    expect(html).toContain("<p>the details</p>");
    expect(html).not.toContain("<p>the history</p>");
  });

  it("keeps the body scrollable — the panels sit inside .admin-drawer-body", () => {
    const html = renderToStaticMarkup(
      <DetailDrawer open onClose={() => {}} title="Accord Plumbing" history={<p>the history</p>}>
        <p>the details</p>
      </DetailDrawer>,
    );

    const body = html.indexOf('class="admin-drawer-body"');
    expect(body).toBeGreaterThan(-1);
    expect(html.indexOf('role="tablist"')).toBeGreaterThan(body);
  });
});
