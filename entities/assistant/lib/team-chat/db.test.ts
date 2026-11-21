// The team assistant's SQL tool names the private list on top of the role's
// grants. The grants are the boundary; this pins the extra layer, so a private
// table refused today is not quietly let through by an edit to the pattern.

import { describe, expect, it } from "vitest";
import { validateReadQuery } from "../read-executor";
import { TEAM_BLOCKED } from "./db";

const refused = (sql: string) => validateReadQuery(sql, TEAM_BLOCKED);

describe("team query_database blocked tables", () => {
  it.each([
    "select * from company_os.invoices",
    "select * from company_os.performance_reviews",
    "select * from company_os.payroll_lines_sensitive",
    "select * from company_os.compensation_sensitive",
    "select * from company_os.reimbursement_claims",
    "select * from company_os.coaching_one_on_ones",
    "select * from company_os.survey_responses",
    "select * from company_os.candidates",
    "select * from company_os.call_transcripts",
    "select * from company_os.email_messages",
    "select * from company_os.person_companies",
    "select * from company_os.audit_log",
    "with g as (select * from company_os.goals) select * from g",
  ])("refuses %s", (sql) => {
    expect(refused(sql)).toEqual({ ok: false, error: TEAM_BLOCKED.message });
  });

  it.each([
    "select title, status from company_os.tasks order by updated_at desc limit 20",
    "select * from company_os.sprints",
    "select title, meeting_type from company_os.meetings",
    "select * from company_os.library_documents",
    "select * from company_os.program_documents",
    "select name from company_os.objectives order by quarter",
  ])("lets %s through", (sql) => {
    expect(refused(sql)).toEqual({ ok: true, sql });
  });
});
