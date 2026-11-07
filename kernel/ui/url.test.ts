import { describe, expect, it } from "vitest";
import { externalHref, internalPath, parseLinkInput } from "./url";

// W.116. A PR link is stored as typed, and the card draws it as an href: a
// value with no scheme landed as a path inside this app, and a `javascript:`
// value would have run on click.
describe("externalHref", () => {
  it("keeps an http(s) link", () => {
    expect(externalHref("https://github.com/edge8-ai/edge8-web/pull/1")).toBe("https://github.com/edge8-ai/edge8-web/pull/1");
    expect(externalHref("  http://example.com/a  ")).toBe("http://example.com/a");
  });

  it("gives a schemeless link https rather than letting it resolve inside the app", () => {
    expect(externalHref("github.com/edge8-ai/edge8-web/pull/1")).toBe("https://github.com/edge8-ai/edge8-web/pull/1");
    // A host with a port is not a scheme.
    expect(externalHref("example.com:8080/x")).toBe("https://example.com:8080/x");
  });

  it("refuses anything that is not an http(s) link", () => {
    expect(externalHref("javascript:alert(1)")).toBeNull();
    expect(externalHref("JavaScript:alert(1)")).toBeNull();
    expect(externalHref("data:text/html,hi")).toBeNull();
    expect(externalHref("mailto:a@b.co")).toBeNull();
    expect(externalHref("vbscript:msgbox(1)")).toBeNull();
    expect(externalHref("ftp://example.com/x")).toBeNull();
    expect(externalHref("#pr-1612")).toBeNull();
    expect(externalHref("")).toBeNull();
    expect(externalHref(null)).toBeNull();
  });
});

// W.117/W.118. Every writer of a typed link reads it the same way: empty
// clears, a link is kept, anything else is refused rather than cleared.
describe("parseLinkInput", () => {
  it("reads empty, blank, null and undefined as clearing the field", () => {
    for (const raw of ["", "   ", null, undefined]) expect(parseLinkInput(raw)).toEqual({ ok: true, value: null });
  });

  it("keeps a link as externalHref writes it", () => {
    expect(parseLinkInput(" linkedin.com/in/someone ")).toEqual({ ok: true, value: "https://linkedin.com/in/someone" });
    expect(parseLinkInput("http://example.com:8080/x")).toEqual({ ok: true, value: "http://example.com:8080/x" });
  });

  it("refuses a value that is not a link instead of clearing the field", () => {
    for (const raw of ["notes", "javascript:alert(1)", "mailto:a@b.co", "localhost:3000"]) {
      expect(parseLinkInput(raw)).toEqual({ ok: false });
    }
  });
});

// W.118.3 and W.118.5: a stored landing path and an assistant's in-app link
// navigate in place, so they must stay on this site.
describe("internalPath", () => {
  it("keeps a path on this site", () => {
    expect(internalPath("/events/saigon-retreat-2026")).toBe("/events/saigon-retreat-2026");
    expect(internalPath(" /team/people/1?tab=notes#x ")).toBe("/team/people/1?tab=notes#x");
  });

  it("refuses anything that could leave the site", () => {
    for (const raw of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "events/x",
      "",
      null,
    ]) {
      expect(internalPath(raw)).toBeNull();
    }
  });
});
