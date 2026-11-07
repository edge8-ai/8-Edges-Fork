import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, resetQueries, type Query } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import {
  applicationQuestionsOf,
  boardClosedRequisitions,
  boardOpenRequisitions,
  countOpenRequisitions,
  countRequisitionsManagedBy,
  openAndFilledRequisitions,
  openPublicRole,
  openRequisitions,
  publicOpenRoles,
  requisitionRecruiter,
} from "./requisitions";

// A.69: each question is the query its caller used to build by hand around
// selectJobRequisitions. The expected steps are those callers' chains as they
// stood on main before the card, spelled out here rather than imported.
const q = (...steps: Query["steps"]): Query => ({ table: "job_requisitions", steps });
const NAMES = "display_name, preferred_name, full_name, email";
const BOARD =
  "id, title, status, headcount, location, employment_type, opened_at, closed_at, hiring_manager_id, " +
  `people:people!hiring_manager_id(${NAMES})`;
const SINCE = "2026-04-29T00:00:00.000Z";

const cases: [string, () => Promise<unknown>, Query][] = [
  // team lib/data.ts getOpenRoles
  [
    "openRequisitions",
    () => openRequisitions(),
    q(["select", "id, title, slug, location, employment_type, is_public, hiring_manager_id"], ["eq", "status", "open"]),
  ],
  // team lib/hiring.ts isHiringManager
  [
    "countRequisitionsManagedBy",
    () => countRequisitionsManagedBy("p1"),
    q(["select", "id", { count: "exact", head: true }], ["eq", "hiring_manager_id", "p1"]),
  ],
  // team lib/hiring.ts getTeamHiring, a hiring manager: the filter is chained last
  [
    "boardOpenRequisitions, a manager",
    () => boardOpenRequisitions("p1"),
    q(
      ["select", BOARD],
      ["in", "status", ["open", "on_hold", "draft"]],
      ["order", "opened_at", { ascending: false }],
      ["eq", "hiring_manager_id", "p1"],
    ),
  ],
  // ... and an admin: every role
  [
    "boardOpenRequisitions, an admin",
    () => boardOpenRequisitions(null),
    q(["select", BOARD], ["in", "status", ["open", "on_hold", "draft"]], ["order", "opened_at", { ascending: false }]),
  ],
  [
    "boardClosedRequisitions, a manager",
    () => boardClosedRequisitions("p1", SINCE, 25),
    q(
      ["select", BOARD],
      ["in", "status", ["filled", "closed", "cancelled"]],
      ["gte", "closed_at", SINCE],
      ["order", "closed_at", { ascending: false }],
      ["limit", 25],
      ["eq", "hiring_manager_id", "p1"],
    ),
  ],
  [
    "boardClosedRequisitions, an admin",
    () => boardClosedRequisitions(null, SINCE, 25),
    q(
      ["select", BOARD],
      ["in", "status", ["filled", "closed", "cancelled"]],
      ["gte", "closed_at", SINCE],
      ["order", "closed_at", { ascending: false }],
      ["limit", 25],
    ),
  ],
  // site lib/jobs.ts getActiveJobs
  [
    "publicOpenRoles",
    () => publicOpenRoles(),
    q(
      ["select", "id, slug, title, employment_type, location, opened_at, full_jd, description, metadata"],
      ["eq", "status", "open"],
      ["eq", "is_public", true],
      ["order", "opened_at", { ascending: false }],
    ),
  ],
  // hiring api/careers/apply/upload/route.ts
  [
    "openPublicRole",
    () => openPublicRole("r1"),
    q(["select", "id"], ["eq", "id", "r1"], ["eq", "status", "open"], ["eq", "is_public", true], ["maybeSingle"]),
  ],
  // hiring api/careers/apply/route.ts and the site's routes/careers/[slug]/apply/page.tsx
  [
    "applicationQuestionsOf",
    () => applicationQuestionsOf("r1"),
    q(["select", "application_questions"], ["eq", "id", "r1"], ["maybeSingle"]),
  ],
  // company-os admin dashboard
  [
    "countOpenRequisitions",
    () => countOpenRequisitions(),
    q(["select", "id", { count: "exact", head: true }], ["eq", "status", "open"]),
  ],
  // company-os admin talent page
  [
    "openAndFilledRequisitions",
    () => openAndFilledRequisitions(),
    q(
      ["select", "id, title, status, opened_at, closed_at"],
      ["in", "status", ["open", "filled"]],
      ["order", "opened_at", { ascending: false }],
    ),
  ],
  // onboarding lib/cycle.ts recruiterEmailFor
  ["requisitionRecruiter", () => requisitionRecruiter("r1"), q(["select", "recruiter_id"], ["eq", "id", "r1"], ["maybeSingle"])],
];

beforeEach(() => resetQueries());

describe("hiring's requisition questions make their callers' queries", () => {
  it.each(cases)("%s", async (_name, ask, expected) => {
    await ask();
    expect(queries).toEqual([expected]);
  });
});
