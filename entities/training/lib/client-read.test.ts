import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

import { clientRecap, clientSummary } from "./client-read";

// ADR 0016, amended 2026-11-19: a client reads the programme, the roster's
// names, each session's published lesson summary and the weekly recaps sent
// to them. Never a review, a teacher's note to a learner, the instructor's
// feedback, the English evaluation, homework or a submission, an outcome, the
// register itself, or a recap's own line to one learner. Proved two ways: by
// the source of the read and the portal pages, and by what the pure shapers
// hand back.
const ROOT = path.resolve(__dirname, "../../..");
const READ = "entities/training/lib/client-read.ts";
const PORTAL = "entities/training/routes/portal";
const FORBIDDEN = /training_(reviews|learner_notes|learner_feedback|submissions|outcomes|outcome_credits|attendance|assignments|weekly_goals|programme_narrations|change_notes)|english-evaluation|lesson-feedback|learner-notes|homework_suggestion|my-training|learner-read|class-read|programme-read/;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe("what a client reads of training", () => {
  it("names nothing outside the allow-list, in the read or the portal pages", () => {
    const files = [READ, ...sources(PORTAL)];
    expect(files.length).toBeGreaterThan(2);
    for (const f of files) expect(fs.readFileSync(path.join(ROOT, f), "utf8"), f).not.toMatch(FORBIDDEN);
    // The read never reaches into a recap's line to one learner.
    expect(fs.readFileSync(path.join(ROOT, READ), "utf8")).not.toMatch(/\.learners\b/);
  });

  it("reaches the portal pages through client-read alone among training's reads", () => {
    for (const f of sources(PORTAL)) {
      const libs = [...fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/from "@\/entities\/training\/lib\/([^"]+)"/g)].map((m) => m[1]);
      for (const lib of libs) expect(["client-read", "training-format", "weekly-recap-rules"], `${f} imports ${lib}`).toContain(lib);
    }
  });

  it("shows a session's summary only once its recap is published, and only what was covered", () => {
    const recap = { covered: "Past tense in stand-ups.", learners: [{ person_id: "11111111-1111-4111-8111-111111111111", md: "Your line." }], homework_suggestion: "Record a stand-up." };
    expect(clientSummary({ recap_state: "drafted", recap })).toBeNull();
    expect(clientSummary({ recap_state: "none", recap: null })).toBeNull();
    expect(clientSummary({ recap_state: "published", recap })).toBe("Past tense in stand-ups.");
  });

  it("hands back a sent weekly recap as it was emailed, the progress lines named", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const r = clientRecap(
      { week_start: "2026-11-16", sent_at: "2026-11-21T09:00:00Z", instructor_note: "A strong week.", draft: { this_week: "Frameworks.", attendance: "Both at 2 of 2.", progress: [{ person_id: id, md: "Clearer endings." }], next_week: "Mock calls." } },
      new Map([[id, "A Learner"]]),
    );
    expect(r).toEqual({ weekStart: "2026-11-16", sentAt: "2026-11-21T09:00:00Z", thisWeek: "Frameworks.", attendance: "Both at 2 of 2.", progress: [{ name: "A Learner", md: "Clearer endings." }], nextWeek: "Mock calls.", instructorNote: "A strong week." });
    expect(clientRecap({ week_start: "2026-11-16", sent_at: null, instructor_note: null, draft: null }, new Map())).toBeNull();
  });
});
