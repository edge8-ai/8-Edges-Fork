import { describe, expect, it } from "vitest";
import { SIGN_IN_LINK_MARKER, redactSignInLinks } from "./sign-in-links";

// The backstop that keeps a sign-in credential out of company_os.interactions.
// Each positive case is a link shape one of our senders has actually emailed;
// each negative case is a link a stored body must keep, because the timeline is
// meant to show what the email said.

const M = SIGN_IN_LINK_MARKER;

describe("redactSignInLinks — links that are credentials", () => {
  it.each([
    ["the admin verify interstitial", "https://example.com/admin/verify?token_hash=abc123&type=magiclink"],
    ["the team verify interstitial", "https://example.com/team/verify?token_hash=abc123&type=recovery"],
    ["the portal invite", "https://example.com/portal/verify?token_hash=abc123&type=invite"],
    ["a retreat verification link", "https://example.com/api/my-retreat/verify?token=eyJhbGciOi.x.y"],
    [
      "Supabase's raw action_link",
      "https://proj.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https://example.com/portal/callback",
    ],
    ["a bare /verify path", "https://example.com/team/verify"],
    ["a token_hash on any path", "https://example.com/somewhere?token_hash=abc123"],
    ["an access_token in the fragment", "https://example.com/callback#access_token=eyJ.a.b&expires_in=3600"],
    ["a type=recovery on any path", "https://example.com/reset?type=recovery&code=1"],
    ["a type=invite on any path", "https://example.com/join?x=1&type=invite"],
    ["a root-relative verify link", "/portal/verify?token_hash=abc123&type=magiclink"],
  ])("removes %s", (_label, url) => {
    expect(redactSignInLinks(url)).toBe(M);
  });

  it("removes the link from an html href and keeps the markup around it", () => {
    const html = `<p>Sign in:</p><p><a href="https://example.com/team/verify?token_hash=abc123&amp;type=magiclink" style="x">Sign in</a></p>`;
    const out = redactSignInLinks(html);
    expect(out).toBe(`<p>Sign in:</p><p><a href="${M}" style="x">Sign in</a></p>`);
    expect(out).not.toContain("abc123");
  });

  it("catches the escaped ampersand an html attribute may carry", () => {
    expect(redactSignInLinks("https://example.com/cb?x=1&amp;access_token=secret")).toBe(M);
  });

  it("catches a sign-in link percent-encoded inside another URL", () => {
    const wrapped = `https://safelinks.example.net/?url=${encodeURIComponent("https://example.com/portal/verify?token_hash=abc123")}`;
    expect(redactSignInLinks(wrapped)).toBe(M);
  });

  it("keeps the sentence's full stop when a link ends one", () => {
    expect(redactSignInLinks("Open https://example.com/team/verify?token_hash=abc123.")).toBe(`Open ${M}.`);
  });

  it("removes every link when an email carries more than one", () => {
    const out = redactSignInLinks(
      "a https://example.com/team/verify?token_hash=one b https://example.com/admin/verify?token_hash=two",
    );
    expect(out).toBe(`a ${M} b ${M}`);
  });
});

describe("redactSignInLinks — links a stored body keeps", () => {
  it.each([
    ["an ordinary marketing link", "https://example.org/blog/ai-agents-for-sales?utm_source=newsletter&utm_campaign=sept"],
    ["the login page a sign-in email points back to", "https://example.com/team/login"],
    ["an event ticket", "https://example.com/events/ticket/7f3c2a"],
    ["a page whose path merely mentions verification", "https://example.com/blog/how-we-verify-claims"],
    ["a /verified path", "https://example.com/account/verified"],
    ["a type parameter that is not an auth flow", "https://example.com/products?type=workshop"],
    ["a parameter that only ends in token", "https://example.com/unsubscribe?unsubscribe_token=abc"],
    ["a mailto link", "mailto:hello@example.com"],
  ])("keeps %s", (_label, url) => {
    expect(redactSignInLinks(url)).toBe(url);
  });

  it("leaves a body with no links untouched, slashes included", () => {
    const text = "<p>Hi and/or hello, 50/50 on the date.</p>";
    expect(redactSignInLinks(text)).toBe(text);
  });

  it("removes only the sign-in link from a body that also carries a marketing link", () => {
    const html =
      `<p><a href="https://example.com/portal/verify?token_hash=abc123&type=invite">Open</a></p>` +
      `<p>Read <a href="https://example.org/blog/launch?utm_source=email">our launch post</a>.</p>`;
    expect(redactSignInLinks(html)).toBe(
      `<p><a href="${M}">Open</a></p>` +
        `<p>Read <a href="https://example.org/blog/launch?utm_source=email">our launch post</a>.</p>`,
    );
  });
});
