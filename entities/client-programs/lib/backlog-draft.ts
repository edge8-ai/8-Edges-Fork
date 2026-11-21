import type { BacklogItem } from "./client-backlog";
import type { BacklogItemInput } from "./roadmap-actions";

// The roadmap editor's draft shape and its two conversions, split out of
// BacklogAdminEditor.tsx for the file-size gate.
export type Draft = Partial<BacklogItemInput> & { needsCsv?: string };

export function itemToDraft(it: BacklogItem): Draft {
  return {
    group_key: it.group_key,
    ai_program_id: it.ai_program_id,
    title: it.title,
    who: it.who ?? "",
    today_state: it.today_state ?? "",
    build_desc: it.build_desc ?? "",
    needsCsv: (it.needs ?? []).join(", "),
    token_low: it.token_low,
    token_high: it.token_high,
    edge8_priority: it.edge8_priority,
    status: it.status,
  };
}

export function draftToInput(d: Draft): BacklogItemInput {
  return {
    group_key: d.group_key ?? "",
    ai_program_id: d.ai_program_id ?? null,
    title: d.title ?? "",
    who: d.who,
    today_state: d.today_state,
    build_desc: d.build_desc,
    needs: (d.needsCsv ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    token_low: d.token_low === undefined || (d.token_low as unknown as string) === "" ? null : Number(d.token_low),
    token_high: d.token_high === undefined || (d.token_high as unknown as string) === "" ? null : Number(d.token_high),
    edge8_priority: d.edge8_priority,
    status: d.status,
  };
}
