import { describe, expect, it, vi } from "vitest";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";
import { portalLinkEmail } from "./portal-emails";

// The origin is read from the request headers, which a test does not have.
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://example.com" }));

// B.15. The sender scan (kernel/messaging/sign-in-link-senders.test.ts) sees
// that portal-invite passes `linkEmail.logBody`; this is what proves that body
// leaves the link out while the email the recipient gets keeps it.

const URL = "https://example.com/portal/verify?token_hash=abc123secret&type=invite";

describe("portalLinkEmail", () => {
  it.each(["invite", "sign_in", "reset"] as const)("%s: sends the link and logs the email without it", async (kind) => {
    const { html, logBody } = await portalLinkEmail(kind, URL);
    expect(html).toContain(`href="${URL}"`);
    expect(logBody).not.toContain("abc123secret");
    expect(logBody).not.toContain("/portal/verify");
    expect(logBody).toContain(SIGN_IN_LINK_WITHHELD);
    // Apart from the button, the logged body is the email that went out.
    expect(logBody.replace(SIGN_IN_LINK_WITHHELD, "")).toBe(html.replace(/<p style="margin:20px 0;">.*?<\/p>/, ""));
  });
});
