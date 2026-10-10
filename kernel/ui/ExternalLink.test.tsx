import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalLink } from "./ExternalLink";

// W.118. Every typed link the app renders goes through this component, so what
// reaches the href is decided here and nowhere else.
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("ExternalLink", () => {
  it("draws a link in a new tab, with no opener", () => {
    expect(html(<ExternalLink href="https://example.com/a">Open</ExternalLink>)).toBe(
      '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">Open</a>',
    );
  });

  it("gives a stored schemeless link https instead of a path inside the app", () => {
    expect(html(<ExternalLink href="linkedin.com/in/someone">LinkedIn</ExternalLink>)).toContain(
      'href="https://linkedin.com/in/someone"',
    );
  });

  it("draws the fallback, never an anchor, for a value that is not a link", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "notes", "", null, undefined]) {
      expect(html(<ExternalLink href={bad} fallback="—">Profile</ExternalLink>)).toBe("—");
    }
    expect(html(<ExternalLink href="javascript:alert(1)">Profile</ExternalLink>)).toBe("");
  });

  it("passes the other anchor props through, and shows the link itself without children", () => {
    expect(html(<ExternalLink href="example.com" className="admin-btn" title="t" />)).toBe(
      '<a class="admin-btn" title="t" href="https://example.com/" target="_blank" rel="noopener noreferrer">https://example.com/</a>',
    );
  });
});
