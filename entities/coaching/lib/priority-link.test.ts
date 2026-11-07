import { describe, expect, it } from "vitest";
import { LINK_TITLE_MAX, isRenderableLink, normalisePriorityLink } from "./priority-link";

describe("normalisePriorityLink", () => {
  it("keeps an ordinary link and its title", () => {
    expect(normalisePriorityLink({ url: "https://basecamp.com/shapeup", title: "Shape Up, ch. 2" })).toEqual({
      url: "https://basecamp.com/shapeup",
      title: "Shape Up, ch. 2",
    });
  });

  it("treats no link as no link, not as an error", () => {
    expect(normalisePriorityLink({ url: "", title: "" })).toBeNull();
    expect(normalisePriorityLink({ url: "   ", title: "something" })).toBeNull();
    expect(normalisePriorityLink({ url: null, title: null })).toBeNull();
    expect(normalisePriorityLink({ url: undefined, title: undefined })).toBeNull();
  });

  it("falls back to the host when the coach typed no title", () => {
    expect(normalisePriorityLink({ url: "https://lethain.com/career-narratives/", title: "" })?.title).toBe(
      "lethain.com",
    );
  });

  // The reason this module exists. A stored href is rendered into the member's
  // page; a scheme outside the allowlist is script execution, not a link.
  it.each([
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("refuses %s", (url) => {
    expect(normalisePriorityLink({ url, title: "Read this" })).toBeNull();
  });

  it("refuses something that is not a URL at all", () => {
    expect(normalisePriorityLink({ url: "read the scoping doc", title: "Scoping" })).toBeNull();
  });

  it("caps a title so a row never becomes a paragraph", () => {
    const long = "x".repeat(LINK_TITLE_MAX + 50);
    const out = normalisePriorityLink({ url: "https://example.com", title: long });
    expect(out?.title).toHaveLength(LINK_TITLE_MAX);
  });

  it("trims what was typed around both fields", () => {
    expect(normalisePriorityLink({ url: "  https://example.com/a  ", title: "  Title  " })).toEqual({
      url: "https://example.com/a",
      title: "Title",
    });
  });
});

describe("isRenderableLink", () => {
  it("passes a stored http(s) link", () => {
    expect(isRenderableLink("https://example.com")).toBe(true);
    expect(isRenderableLink("http://example.com")).toBe(true);
  });

  // Rows written before the rule existed still reach the page; the component
  // asks this rather than trusting the column.
  it("refuses a stored row carrying a bad scheme", () => {
    expect(isRenderableLink("javascript:alert(1)")).toBe(false);
    expect(isRenderableLink("not a url")).toBe(false);
    expect(isRenderableLink(null)).toBe(false);
    expect(isRenderableLink("")).toBe(false);
  });
});
