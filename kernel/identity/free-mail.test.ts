import { describe, expect, it } from "vitest";
import { FREE_MAIL_DOMAINS } from "./company-by-email-domain";
import { companyDomainOf, emailDomain, isFreeMailDomain } from "./free-mail";

// The one list of free mailboxes (B.14, widened for Z.11): no company is ever
// matched by, or created from, an address at one of them.

describe("free mailboxes", () => {
  it.each([
    "gmail.com",
    "Outlook.com",
    "hotmail.com.au",
    "outlook.com.au",
    "live.com.au",
    "bigpond.net.au",
    "iinet.net.au",
    "tpg.com.au",
    "xtra.co.nz",
    "protonmail.ch",
    "comcast.net",
    "att.net",
    "verizon.net",
    "yahoo.com.vn",
    "me.com",
  ])("names %s free", (domain) => expect(isFreeMailDomain(domain)).toBe(true));

  it.each(["hotmail.co.uk", "yahoo.co.jp", "outlook.de", "live.fr", "gmx.at", "yandex.kz", "proton.me", "zoho.in", "icloud.com.cn", "aol.co.uk", "ymail.ne.jp", "mail.gmail.com"])(
    "names the provider %s free under any suffix",
    (domain) => expect(isFreeMailDomain(domain)).toBe(true),
  );

  it.each(["example-freight.test", "acme.com.au", "hotmailer.com", "gmailfans.org", "mygmail.com", "liveops.com"])("leaves %s a company domain", (domain) =>
    expect(isFreeMailDomain(domain)).toBe(false),
  );

  it("reads a missing domain as free, and an address's domain only when it is well formed", () => {
    expect(isFreeMailDomain(null)).toBe(true);
    expect(emailDomain("A@Example.TEST.")).toBe("example.test");
    expect(emailDomain("not an address")).toBeNull();
    expect(companyDomainOf("x@hotmail.com.au")).toBeNull();
    expect(companyDomainOf("x+tag@example-freight.test")).toBe("example-freight.test");
  });

  it("is the list the email-domain company lookup re-exports", () => {
    expect(FREE_MAIL_DOMAINS.has("hotmail.com.au")).toBe(true);
  });
});
