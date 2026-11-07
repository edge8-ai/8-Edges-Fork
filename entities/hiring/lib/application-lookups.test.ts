import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  activeApplicationDates,
  anyApplicationOf,
  applicationDatesSince,
  applicationForScreen,
  applicationFunnel,
  boardApplications,
  hiringManagerOfApplication,
  latestApplicationOf,
  setApplicationMetadata,
  stagesOfRequisitions,
} from "./application-lookups";

// A.69: each question or command is the query its caller used to build by
// hand around selectApplications / selectApplicationStages /
// updateApplications. The expected steps are those callers' chains as they
// stood on main before the card.
const apps = (...steps: Query["steps"]): Query => ({ table: "applications", steps });
const NAMES = "display_name, preferred_name, full_name, email";
const SINCE = "2026-08-27T00:00:00.000Z";

const cases: [string, () => Promise<unknown>, Query][] = [
  // company-os Admin Home, Team this week
  [
    "activeApplicationDates",
    () => activeApplicationDates(),
    apps(["select", "applied_at"], ["eq", "status", "active"], ["is", "archived_at", null], ["order", "applied_at", { ascending: false }], ["limit", 500]),
  ],
  // team lib/hiring.ts getTeamHiring
  [
    "boardApplications",
    () => boardApplications(["r1", "r2"]),
    apps(
      [
        "select",
        "id, job_requisition_id, current_stage_id, rating, applied_at, archived_at, metadata, " +
          `people:people!person_id(${NAMES})`,
      ],
      ["in", "job_requisition_id", ["r1", "r2"]],
      ["is", "archived_at", null],
    ),
  ],
  [
    "stagesOfRequisitions",
    () => stagesOfRequisitions(["r1"]),
    {
      table: "application_stages",
      steps: [
        ["select", "id, job_requisition_id, name, position, is_terminal"],
        ["in", "job_requisition_id", ["r1"]],
        ["order", "position"],
      ],
    },
  ],
  // team lib/family-screen.ts runFamilyScreen
  [
    "applicationForScreen",
    () => applicationForScreen("a1"),
    apps(["select", "id, metadata, resume_document_id"], ["eq", "id", "a1"], ["maybeSingle"]),
  ],
  [
    "setApplicationMetadata",
    () => setApplicationMetadata("a1", { family_screen: { rating: 4 } }),
    apps(["update", { metadata: { family_screen: { rating: 4 } } }], ["eq", "id", "a1"]),
  ],
  // team hiring/manage-actions.ts actorManagesApplication
  [
    "hiringManagerOfApplication",
    () => hiringManagerOfApplication("a1"),
    apps(
      ["select", "job_requisitions:job_requisitions!job_requisition_id ( hiring_manager_id )"],
      ["eq", "id", "a1"],
      ["maybeSingle"],
    ),
  ],
  // company-os admin dashboard
  [
    "applicationDatesSince",
    () => applicationDatesSince(SINCE, 2000),
    apps(["select", "applied_at"], ["gte", "applied_at", SINCE], ["limit", 2000]),
  ],
  // company-os admin talent page
  [
    "applicationFunnel",
    () => applicationFunnel(3000),
    apps(["select", "status, applied_at, decided_at, job_requisition_id"], ["limit", 3000]),
  ],
  // onboarding lib/cycle.ts recruiterEmailFor
  [
    "latestApplicationOf",
    () => latestApplicationOf("p1"),
    apps(
      ["select", "job_requisition_id"],
      ["eq", "person_id", "p1"],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
      ["maybeSingle"],
    ),
  ],
  // onboarding lib/data.ts processOnboardingSubmission
  [
    "anyApplicationOf",
    () => anyApplicationOf("p1"),
    apps(["select", "id"], ["eq", "person_id", "p1"], ["limit", 1], ["maybeSingle"]),
  ],
];

beforeEach(() => resetQueries());

describe("hiring's application questions make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });

  it("hands back the requisition embed as PostgREST answered it, for the caller's one()", async () => {
    answerNext({ data: { job_requisitions: [{ hiring_manager_id: "p9" }] }, error: null });
    expect(await hiringManagerOfApplication("a1")).toEqual({
      data: { job_requisitions: [{ hiring_manager_id: "p9" }] },
      error: null,
    });
  });
});
