import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ADR 0016, amended 2026-10-26: a lesson's English evaluation and the
// teacher's feedback are read by the lesson's teacher and by admins, never by
// the learner while the evaluation is tested. Proved by the source: only the
// files named here may touch the table or the modules that read it, none of
// them is a learner's page or read, and the learner's own reads name none of it.
const ROOT = path.resolve(__dirname, "../../..");
const TOUCHES = /training_learner_feedback"|\/lesson-feedback"|\/english-evaluation"|\/class-read"|\/EnglishEvaluation"|\/LessonFeedbackPanel"/;

const ALLOWED = [
  // The table's owner list.
  "entities/training/tables.ts",
  // The evaluation's writer and the feedback's reader and writer.
  "entities/training/lib/english-evaluation.ts",
  "entities/training/lib/lesson-feedback.ts",
  // The Admin view's class read and its two pages.
  "entities/training/lib/class-read.ts",
  "entities/training/routes/admin/(dashboard)/talent/training/page.tsx",
  "entities/training/routes/admin/(dashboard)/talent/training/classes/[id]/page.tsx",
  // The teacher's session page, its actions and its panel.
  "entities/training/routes/team/(dashboard)/training/sessions/[id]/page.tsx",
  "entities/training/routes/team/(dashboard)/training/sessions/[id]/actions.ts",
  "entities/training/ui/LessonFeedbackPanel.tsx",
  // The recap routine, which evaluates after drafting.
  "entities/training/crons/training-session-recap.ts",
].sort();

// What a learner reads: My Training, its session page and the reads behind them.
const LEARNER_READS = ["entities/training/lib/my-session.ts", "entities/training/lib/my-training.ts", "entities/training/lib/my-training-read.ts", "entities/training/lib/learner-read.ts", "entities/training/ui/MySessionPage.tsx", "entities/training/ui/LearnerPage.tsx"];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) out.push(...sources(rel));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

describe("who reads a lesson's evaluation and feedback", () => {
  it("is touched only by the teacher's and the admin's files", () => {
    const touching = ["entities", "app", "kernel"].flatMap(sources).filter((f) => TOUCHES.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
    expect(touching.sort()).toEqual(ALLOWED);
  });

  it("is in none of the learner's pages or reads", () => {
    for (const f of [...LEARNER_READS, ...sources("entities/training/routes/team/(dashboard)/my-training")]) {
      expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      expect(text, f).not.toMatch(/training_learner_feedback|evaluation|lesson-feedback/);
    }
    expect(ALLOWED.some((f) => f.includes("my-training"))).toBe(false);
  });
});
