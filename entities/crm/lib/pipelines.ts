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

/** Every stage of the live pipelines, in order, with whether it closes a deal (the connector's Revenue tools, OC.4). */
export function pipelineStagesInOrder() {
  return companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position");
}

/** The names of these stages, by id. */
export async function pipelineStageNames(stageIds: string[]) {
  return companyOs.from("pipeline_stages").select("id, name").in("id", stageIds);
}
