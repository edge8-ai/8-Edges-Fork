import { companyOs } from "@/kernel/data/supabase";
import { selectAiPrograms } from "@/entities/client-programs";

// How many live AI Programs each company has, for the admin Client Hubs list.
// client-programs owns ai_programs, so the read goes through its door; this
// stays a portal function because the count is the portal's question.
export async function countActiveProgramsByCompany(): Promise<Map<string, number>> {
  const { data, error } = await selectAiPrograms("company_id").neq("status", "archived");
  if (error) throw new Error(`ai_programs: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { company_id: string }[]) counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
  return counts;
}
