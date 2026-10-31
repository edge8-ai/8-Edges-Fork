import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The questions and writes onboarding's door answers for company-os, htt and
// team (A.70). Each row is the query or write a caller in another entity built
// by hand before A.70 through selectOnboardingPlans, selectPersonGitEmails,
// insertPersonGitEmails or updateOnboardingTasks, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { gitEmailClaim, recordDiscoveredGitEmail } from "./git-emails";
import { editOnboardingTask, onboardingStages, tickOwnOnboardingTask } from "./plan-progress";

const NOW = "2026-10-26T03:00:00.000Z";
beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  // company-os talent dashboard.
  ["onboardingStages", () => onboardingStages(), "onboarding_plans", [["select", "stage"]]],
  // htt registrations.
  ["gitEmailClaim", () => gitEmailClaim("dev@example.test"), "person_git_emails", [["select", "id"], ["eq", "git_email", "dev@example.test"], ["maybeSingle"]]],
  [
    "recordDiscoveredGitEmail",
    () => recordDiscoveredGitEmail("dev@example.test", "p1"),
    "person_git_emails",
    [["insert", { git_email: "dev@example.test", person_id: "p1", source: "discovered" }]],
  ],
  // team updateInScope("onboarding_tasks", ...).
  ["editOnboardingTask", () => editOnboardingTask("t1", { status: "done" }), "onboarding_tasks", [["update", { status: "done" }], ["eq", "id", "t1"]]],
  // team toggleMyOnboardingTask: the task, and only the actor's own.
  [
    "tickOwnOnboardingTask, done",
    () => tickOwnOnboardingTask("t1", "tm1", true),
    "onboarding_tasks",
    [["update", { status: "done", completed_at: NOW, updated_at: NOW }], ["eq", "id", "t1"], ["eq", "team_member_id", "tm1"]],
  ],
  [
    "tickOwnOnboardingTask, undone",
    () => tickOwnOnboardingTask("t1", "tm1", false),
    "onboarding_tasks",
    [["update", { status: "todo", completed_at: null, updated_at: NOW }], ["eq", "id", "t1"], ["eq", "team_member_id", "tm1"]],
  ],
];

describe("onboarding questions and writes", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
