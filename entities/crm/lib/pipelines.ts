// The sales pipelines and their stages, as other entities ask about them (A.63).
import { companyOs } from "@/kernel/data/supabase";

/** The oldest active pipeline with its stages' ids and positions, or null when none is active. */
export async function firstActivePipeline() {
  return companyOs
    .from("pipelines")
    .select("id, pipeline_stages(id, position)")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
}

/** The names of these stages, by id. */
export async function pipelineStageNames(stageIds: string[]) {
  return companyOs.from("pipeline_stages").select("id, name").in("id", stageIds);
}
