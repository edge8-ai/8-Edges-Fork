// Survey responses for the Revenue morning list (the Lark notifications plan).
// Built here because org owns survey_responses.

import { companyOs } from "@/kernel/data/supabase";
import { NO_OWNER, plural, rows, type ListLine } from "@/kernel/messaging/office-list";

export async function surveyMorningLines(since: string): Promise<ListLine[]> {
  const responses = await rows("survey responses", companyOs.from("survey_responses").select("submitted_at").gte("submitted_at", since));
  if (responses.length === 0) return [];
  return [{ who: NO_OWNER, text: `${plural(responses.length, "survey response")} since the last list. Read and reply.`, href: "/admin/operations/surveys" }];
}
