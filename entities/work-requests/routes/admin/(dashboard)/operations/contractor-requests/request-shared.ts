// Shared row type + select for the contractor work-requests list. The people
// embeds use explicit FK hints (two people FKs would break a bare embed at
// runtime); requester/client_company only exist on portal-origin rows.

import { one } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, type GreetedPerson } from "@/kernel/config/people-name";

export const REQUEST_SELECT =
  `id, person_id, title, brief, access_token, status, estimated_hours, plan_text, estimate_submitted_at, decided_at, actual_hours, actual_overtime_hours, work_summary, work_link, work_submitted_at, accepted_at, payment_id, created_by, created_at, origin, client_company_id, requested_by_person_id, people!person_id(${GREETING_COLUMNS}), requester:people!requested_by_person_id(${GREETING_COLUMNS}), client_company:companies!client_company_id(name)`;

export type RequestRow = {
  id: string;
  person_id: string;
  title: string;
  brief: string;
  access_token: string;
  status: string;
  estimated_hours: number | string | null;
  plan_text: string | null;
  estimate_submitted_at: string | null;
  decided_at: string | null;
  // Who decided the estimate, from its approval (S.5 contract): derived by
  // withEstimateDeciders in request-deciders.ts, not a column.
  estimate_decider?: string | null;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
  work_summary: string | null;
  work_link: string | null;
  work_submitted_at: string | null;
  accepted_at: string | null;
  payment_id: string | null;
  created_by: string;
  created_at: string;
  origin: "admin" | "portal";
  client_company_id: string | null;
  requested_by_person_id: string | null;
  people:
    | (GreetedPerson & { email: string })
    | (GreetedPerson & { email: string })[]
    | null;
  requester:
    | (GreetedPerson & { email: string })
    | (GreetedPerson & { email: string })[]
    | null;
  client_company: { name: string | null } | { name: string | null }[] | null;
};

export type RequestEventRow = {
  id: string;
  actor_type: string;
  actor: string | null;
  type: string;
  body: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export const onePerson = (e: RequestRow["people"]) => one(e);

export const oneCompany = (e: RequestRow["client_company"]) => one(e);
