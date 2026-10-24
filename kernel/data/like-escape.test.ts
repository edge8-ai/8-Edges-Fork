import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { escapeLikeLiteral, ilikeLiteral, ilikeLiteralCondition } from "./postgrest-filter";

// `activePortalAuthUser` in portal-invite.ts decides whether a "send me a
// sign-in link" request resolves to a real portal member, and it looks the
// address up with `.ilike`. ILIKE treats % and _ as wildcards, so without this
// escape a crafted address matches other people's rows and the link goes to
// the wrong inbox.

describe("escapeLikeLiteral", () => {
  it("leaves an ordinary address untouched", () => {
    expect(escapeLikeLiteral("person@example.com")).toBe("person@example.com");
    expect(escapeLikeLiteral("first.last+tag@example.co.uk")).toBe("first.last+tag@example.co.uk");
  });

  it("escapes % so a domain wildcard cannot match everyone at that domain", () => {
    expect(escapeLikeLiteral("%@example.com")).toBe("\\%@example.com");
    expect(escapeLikeLiteral("a%b@example.com")).toBe("a\\%b@example.com");
  });

  it("escapes _ so a single-character wildcard cannot match a neighbour", () => {
    expect(escapeLikeLiteral("_x@example.com")).toBe("\\_x@example.com");
    expect(escapeLikeLiteral("a_b@example.com")).toBe("a\\_b@example.com");
  });

  it("escapes the backslash itself, so an escape cannot be smuggled in", () => {
    // Without this, the input `\%@example.com` would arrive at Postgres as a
    // literal backslash followed by a live wildcard.
    expect(escapeLikeLiteral("\\%@example.com")).toBe("\\\\\\%@example.com");
    expect(escapeLikeLiteral("\\")).toBe("\\\\");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(escapeLikeLiteral("%%__")).toBe("\\%\\%\\_\\_");
  });

  it("leaves an escaped value with no live wildcard characters", () => {
    for (const raw of ["%@example.com", "_x@example.com", "%_\\@example.com"]) {
      // Strip the escaped pairs; nothing wildcard-ish may remain.
      expect(escapeLikeLiteral(raw)!.replace(/\\[%_\\]/g, "")).not.toMatch(/[%_\\]/);
    }
  });

  it("does nothing to an empty string", () => {
    expect(escapeLikeLiteral("")).toBe("");
  });
});

// PostgREST's own rewrite of a like/ilike value, copied from
// PostgREST/Query/SqlFragment.hs (`T.map star val`, `star c = if c == '*' then
// '%' else c`): every `*` becomes `%` after the URL is decoded and before
// Postgres reads the pattern. No database runs here, so this stands in for it.
const postgrestStar = (pattern: string): string => pattern.replace(/\*/g, "%");

describe("escapeLikeLiteral and PostgREST's * alias (A.48)", () => {
  it("refuses a literal holding *, which PostgREST would read as %", () => {
    expect(escapeLikeLiteral("*")).toBeNull();
    expect(escapeLikeLiteral("*@example.com")).toBeNull();
    expect(escapeLikeLiteral("a*b@example.com")).toBeNull();
  });

  it("refuses * beside the other metacharacters too, however it is wrapped", () => {
    expect(escapeLikeLiteral("%*_@example.com")).toBeNull();
    expect(escapeLikeLiteral("\\*@example.com")).toBeNull();
    expect(escapeLikeLiteral("_\\%*")).toBeNull();
  });

  it("still leaves an ordinary address unchanged", () => {
    expect(escapeLikeLiteral("person@example.com")).toBe("person@example.com");
  });

  it("returns only patterns PostgREST's rewrite leaves alone", () => {
    for (const raw of ["person@example.com", "%@example.com", "_x@example.com", "\\%_@example.com"]) {
      const escaped = escapeLikeLiteral(raw)!;
      expect(postgrestStar(escaped)).toBe(escaped);
    }
  });

  it("could not escape * instead: a backslashed * reaches Postgres as a literal %", () => {
    // Why the helper refuses rather than escapes. `a\*b` becomes `a\%b`, which
    // matches a row holding `a%b`, a different address from the one typed.
    expect(postgrestStar("a\\*b@example.com")).toBe("a\\%b@example.com");
  });
});

// A real supabase-js client whose fetch records the request and answers with no
// rows, so these read the exact filter that would leave this server.
const sentUrls: string[] = [];
const client = createClient("http://localhost:54321", "test-anon-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input: RequestInfo | URL) => {
      sentUrls.push(input instanceof Request ? input.url : String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    },
  },
});
const people = () => client.from("people").select("id");

async function filterSent(query: PromiseLike<unknown>) {
  sentUrls.length = 0;
  await query;
  const url = new URL(sentUrls[0]);
  return { raw: url.search, email: url.searchParams.get("email"), url: url.searchParams.get("url") };
}

describe("ilikeLiteral, as postgrest-js sends it", () => {
  it("sends an ordinary address as an ilike of itself", async () => {
    const sent = await filterSent(ilikeLiteral(people(), "email", "person@example.com"));
    expect(sent.email).toBe("ilike.person@example.com");
  });

  it("sends % and _ escaped, so they stay literal", async () => {
    const sent = await filterSent(ilikeLiteral(people(), "email", "%_@example.com"));
    expect(sent.email).toBe("ilike.\\%\\_@example.com");
  });

  it("shows the hole: postgrest-js sends a raw * untouched, and PostgREST turns it into %", async () => {
    const sent = await filterSent(people().ilike("email", "*@example.com"));
    expect(sent.raw).toContain("email=ilike.*%40example.com");
    expect(postgrestStar(sent.email!.slice("ilike.".length))).toBe("%@example.com");
  });

  it("sends a literal holding * as an empty in-list, which PostgREST answers with no rows", async () => {
    const sent = await filterSent(ilikeLiteral(people(), "email", "*@example.com"));
    expect(sent.email).toBe("in.()");
    expect(sent.raw).not.toContain("ilike");
  });

  it("places the escaped literal inside the caller's shape", async () => {
    const sent = await filterSent(ilikeLiteral(people(), "url", "my_repo", (e) => `%/${e}/pull/7`));
    expect(sent.url).toBe("ilike.%/my\\_repo/pull/7");
  });
});

// PostgREST's reading of a double-quoted value inside `or(...)`, copied from
// pQuotedValue in PostgREST/ApiRequest/QueryParams.hs: drop the quotes, and a
// backslash keeps the character after it.
const unquote = (quoted: string): string => quoted.slice(1, -1).replace(/\\(.)/g, "$1");

describe("ilikeLiteralCondition, for an or(...) string", () => {
  it("reaches Postgres as the same pattern escapeLikeLiteral gives", () => {
    for (const raw of ["person@example.com", "a_b%c@example.com", "\\%@example.com", 'q"x@example.com']) {
      const condition = ilikeLiteralCondition("respondent_email", raw)!;
      expect(condition.startsWith('respondent_email.ilike."')).toBe(true);
      expect(unquote(condition.slice("respondent_email.ilike.".length))).toBe(escapeLikeLiteral(raw));
    }
  });

  it("keeps a comma or paren inside the quotes, so it cannot add a condition", () => {
    expect(ilikeLiteralCondition("respondent_email", "a,id.gt.0)@example.com")).toBe(
      'respondent_email.ilike."a,id.gt.0)@example.com"',
    );
  });

  it("refuses a value holding *, so the caller leaves the condition out", () => {
    expect(ilikeLiteralCondition("respondent_email", "*@example.com")).toBeNull();
    expect(ilikeLiteralCondition("respondent_email", "a_*%@example.com")).toBeNull();
  });

  it("leaves the client as one or= parameter carrying the quoted pattern", async () => {
    const condition = ilikeLiteralCondition("email", "a_b@example.com")!;
    await filterSent(people().or(`id.eq.p1,${condition}`));
    expect(new URL(sentUrls[0]).searchParams.get("or")).toBe('(id.eq.p1,email.ilike."a\\\\_b@example.com")');
  });
});
