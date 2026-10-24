import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.15.8: a sent email whose link points nowhere breaks the invariant. The
// failing body is the survey reminder production sent on 6 Oct 2026.

const rows = vi.hoisted(() => ({ like: [] as unknown[], ilike: [] as unknown[], error: null as { message: string } | null }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "gte"]) q[op] = () => q;
      q.like = () => ({ limit: async () => ({ data: rows.like, error: rows.error }) });
      q.ilike = () => ({ limit: async () => ({ data: rows.ilike, error: null }) });
      return q;
    },
  },
}));

const { emailLinksAreWhole } = await import("./email-link-invariant");
const NOW = new Date("2026-10-09T00:00:00Z");

beforeEach(() => {
  rows.like = [];
  rows.ilike = [];
  rows.error = null;
});

describe("emailLinksAreWhole (Z.15.8)", () => {
  it("passes when no logged email in the last day has a broken link", async () => {
    expect(await emailLinksAreWhole().check(NOW)).toMatchObject({ ok: true });
  });

  it("breaks on a link built from an un-awaited origin, naming the source and the row, not the person", async () => {
    rows.like = [
      {
        id: "i-1",
        metadata: { source: "survey-reminders" },
        body: '<p>Hi Alex,</p><ul><li><a href="[object Promise]/surveys/post-retreat-team-survey?cohort=x">Survey</a></li></ul>',
      },
    ];
    const r = await emailLinksAreWhole().check(NOW);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("1 email(s) with a broken link (sources: survey-reminders)");
    expect(r.detail).toContain('interaction i-1, link "[object Promise]/surveys/');
    expect(r.detail).not.toContain("Alex");
  });

  it("breaks on a link to a preview deployment's host, and counts a row both reads return once", async () => {
    const row = { id: "i-2", metadata: { source: "onboarding" }, body: '<a href="https://edge8-web-git-x.vercel.app/team">Open</a> [object Object]' };
    rows.ilike = [row];
    rows.like = [row];
    const r = await emailLinksAreWhole().check(NOW);
    expect(r).toMatchObject({ ok: false });
    expect(r.detail).toMatch(/^1 email\(s\)/);
  });

  it("passes text that only mentions the words outside a link", async () => {
    rows.like = [{ id: "i-3", metadata: null, body: "<p>We moved off example.vercel.app; [object Object] was a bug.</p>" }];
    rows.ilike = rows.like;
    expect(await emailLinksAreWhole().check(NOW)).toMatchObject({ ok: true });
  });

  it("throws when it cannot read, so the watchdog counts it broken", async () => {
    rows.error = { message: "db down" };
    await expect(emailLinksAreWhole().check(NOW)).rejects.toThrow("interactions: db down");
  });
});
