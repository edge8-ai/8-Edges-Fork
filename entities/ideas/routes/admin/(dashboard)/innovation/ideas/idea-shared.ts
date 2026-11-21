// Shared between the backlog list page (server) and the shelf (client).

import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export type IdeaRow = {
  id: string;
  kind: string;
  title: string;
  problem: string | null;
  data_needed: string | null;
  workflow: string | null;
  roi: string | null;
  story: string | null;
  takeaway: string | null;
  office: string | null;
  ai_plan: string | null;
  ai_model: string | null;
  ai_error: string | null;
  status: string;
  created_at: string;
  people: (NamedPerson & { email: string }) | null;
  // Server-rendered HTML of ai_plan, attached by the list page so the client
  // shelf never has to parse markdown.
  planHtml?: string | null;
};

// people!person_id: explicit FK hint — bare embeds break at runtime when two
// FKs link the tables.
// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
export const IDEA_SELECT =
  `id, kind, title, problem, data_needed, workflow, roi, story, takeaway, office, ai_plan, ai_model, ai_error, status, created_at, people:people!person_id(${NAME_COLUMNS})`;

export function submitterName(row: IdeaRow): string {
  return personName(one(row.people), "—");
}
