import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";

// Reads for company_os.call_transcripts + call_scorecards (Sales Intelligence).
// Two shapes: the List page never drags transcripts over the wire, the Details
// page loads everything. Rows are written by the nightly calls-transcript-sync
// task on the Mac Mini; scorecards by the weekly scoring pass.

export type CallType = "sales" | "client" | "internal" | "other";

export type CallScorecard = {
  talkRatio: number | null;
  questionCount: number | null;
  scoreTalkRatio: number | null;
  scorePainQuantified: number | null;
  scoreProductFit: number | null;
  scoreObjectionSurfaced: number | null;
  scoreNextStep: number | null;
  coachingMd: string | null;
  scoredBy: string;
  scoredAt: string;
};

export type CallRow = {
  id: string;
  title: string;
  startedAt: string | null;
  durationSeconds: number | null;
  callType: CallType;
  source: string;
  meetingId: string | null;
  minuteToken: string | null;
  scorecard: CallScorecard | null;
};

export type CallDetail = CallRow & { transcript: string };

/** Mean of the five 1-5 dimensions, null until scored. */
export function scorecardAverage(s: CallScorecard | null): number | null {
  if (!s) return null;
  const dims = [
    s.scoreTalkRatio,
    s.scorePainQuantified,
    s.scoreProductFit,
    s.scoreObjectionSurfaced,
    s.scoreNextStep,
  ].filter((v): v is number => v != null);
  if (dims.length === 0) return null;
  return dims.reduce((a, b) => a + b, 0) / dims.length;
}

const ROW_SELECT =
  "id, title, started_at, duration_seconds, call_type, source, meeting_id, minute_token," +
  " scorecard:call_scorecards(talk_ratio, question_count, score_talk_ratio, score_pain_quantified," +
  " score_product_fit, score_objection_surfaced, score_next_step, coaching_md, scored_by, scored_at)";

type ScorecardRaw = {
  talk_ratio: number | string | null;
  question_count: number | null;
  score_talk_ratio: number | null;
  score_pain_quantified: number | null;
  score_product_fit: number | null;
  score_objection_surfaced: number | null;
  score_next_step: number | null;
  coaching_md: string | null;
  scored_by: string;
  scored_at: string;
};

type Raw = {
  id: string;
  title: string;
  started_at: string | null;
  duration_seconds: number | null;
  call_type: CallType;
  source: string;
  meeting_id: string | null;
  minute_token: string | null;
  scorecard?: ScorecardRaw | ScorecardRaw[] | null;
  transcript?: string;
};

function mapRow(r: Raw): CallRow {
  const s = one(r.scorecard);
  return {
    id: r.id,
    title: r.title,
    startedAt: r.started_at,
    durationSeconds: r.duration_seconds,
    callType: r.call_type,
    source: r.source,
    meetingId: r.meeting_id,
    minuteToken: r.minute_token,
    scorecard: s
      ? {
          talkRatio: s.talk_ratio == null ? null : Number(s.talk_ratio),
          questionCount: s.question_count,
          scoreTalkRatio: s.score_talk_ratio,
          scorePainQuantified: s.score_pain_quantified,
          scoreProductFit: s.score_product_fit,
          scoreObjectionSurfaced: s.score_objection_surfaced,
          scoreNextStep: s.score_next_step,
          coachingMd: s.coaching_md,
          scoredBy: s.scored_by,
          scoredAt: s.scored_at,
        }
      : null,
  };
}

export type CallListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: CallType;
};

export type CallListResult = {
  rows: CallRow[];
  total: number;
  error: string | null;
};

// Paginated List-page reader. Search is full-text over the generated tsvector
// (title + transcript), so "cash flow" finds every call where it was said.
export async function listCalls(params: CallListParams = {}): Promise<CallListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;

  let q = companyOs.from("call_transcripts").select(ROW_SELECT, { count: "exact" })
    .range(from, from + pageSize - 1)
    .order("started_at", { ascending: false, nullsFirst: false });

  if (params.type) q = q.eq("call_type", params.type);
  if (params.search?.trim()) {
    q = q.textSearch("search", params.search.trim(), { type: "websearch", config: "english" });
  }

  const { data, count, error } = await q;
  return {
    rows: ((data ?? []) as unknown as Raw[]).map(mapRow),
    total: count ?? 0,
    error: error ? error.message : null,
  };
}

export async function getCall(id: string): Promise<CallDetail | null> {
  const { data, error: callErr } = await companyOs.from("call_transcripts").select(`${ROW_SELECT}, transcript`)
    .eq("id", id)
    .maybeSingle();
  if (callErr) console.error("[company-os/crm] call_transcripts", callErr);
  if (!data) return null;
  const r = data as unknown as Raw;
  return { ...mapRow(r), transcript: r.transcript ?? "" };
}
