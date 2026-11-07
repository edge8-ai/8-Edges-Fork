import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BotText } from "./BotText";

// W.118.5. Assistant replies are model output, and text stored in the database
// can steer them, so what a markdown link or image turns into is decided by the
// same rules as every typed link: a path on this site, a web link, or text.
const html = (text: string) => renderToStaticMarkup(<BotText text={text} />);

describe("BotText links", () => {
  it("opens a web link in a new tab and navigates an in-app path in place", () => {
    expect(html("[profile](https://example.com/p)")).toBe(
      '<p><a href="https://example.com/p" target="_blank" rel="noopener noreferrer">profile</a></p>',
    );
    expect(html("[record](/team/people/1)")).toBe('<p><a href="/team/people/1">record</a></p>');
    expect(html("see /admin/contacts/1.")).toBe('<p>see <a href="/admin/contacts/1">/admin/contacts/1</a>.</p>');
  });

  it("draws a markdown link to any other scheme as its label, with no anchor", () => {
    for (const target of ["javascript:alert%281%29", "data:text/html,x", "vbscript:x"]) {
      expect(html(`[click me](${target})`)).toBe("<p>click me</p>");
    }
    // The link pattern stops at the first ")", so the target here is
    // "javascript:alert(1" and the last ")" stays as text. It is still no link.
    expect(html("[click me](javascript:alert(1))")).not.toContain("href");
  });

  it("never navigates a protocol-relative link in place", () => {
    // "//host" is not a path on this site; it is read as a web link and opens
    // in a new tab, like any https link the model writes.
    expect(html("[x](//evil.example)")).toBe(
      '<p><a href="https://evil.example/" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
  });

  it("links an image from an untrusted host instead of loading it, and never as a script", () => {
    expect(html("![pixel](https://tracker.example/p.gif)")).toBe(
      '<p><a href="https://tracker.example/p.gif" target="_blank" rel="noopener noreferrer">pixel</a></p>',
    );
    expect(html("![x](javascript:alert(1))")).not.toContain("href");
  });
});
