import type { BadgeTone } from "@/kernel/ui/Badge";

// The surveys module's browser-safe half — the vocabulary, row shapes and the
// answer validation the public runner and the admin builder both run — kept
// apart from ./surveys.ts, which opens the service-role Supabase client, so
// entities/company-os/client.ts can re-export this file into a "use client"
// bundle (multi-entity design §3, "two doors").
//
// Domain constants and shared validation for Surveys (Operations → Workplace).
// The tables (surveys / survey_fields / survey_responses / survey_answers)
// pre-date this feature and have an external writer, so the app enforces the
// allowed values here rather than via DB CHECK constraints, and keeps the
// existing conventions: status 'published' (not 'open'), answers store the
// human-readable string in `value` and structured data in `value_json`.

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "rating",
  "yes_no",
  "date",
  "file",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Multiple choice (pick one)",
  multi_choice: "Multiple choice (pick many)",
  rating: "Rating scale",
  yes_no: "Yes / No",
  date: "Date",
  file: "File upload",
};

export const SURVEY_STATUSES = ["draft", "published", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export function surveyStatusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case "published":
      return "ok";
    case "draft":
      return "warn";
    default:
      return "neutral";
  }
}

// survey_fields.config. choices for the choice types; min/max (+ end labels)
// for rating. A 0–10 rating renders NPS aggregates on the results page.
// `file` fields carry an upload target (bucket/accept/max_bytes); any field can
// carry `maps_to` — a "table.column" (or "people.metadata.a.b") destination that
// a purpose-driven survey (e.g. onboarding) writes the answer into after submit.
export type FieldConfig = {
  choices?: string[];
  min?: number;
  max?: number;
  min_label?: string;
  max_label?: string;
  bucket?: string;
  accept?: string[];
  max_bytes?: number;
  maps_to?: string;
  // Per-value anchor text for rating scales ({"1": "...", ..., "5": "..."}).
  // The runner shows the selected value's anchor under the scale.
  levels?: Record<string, string>;
  // Performance reviews: draw the "expected for level" marker on this scale
  // (the level itself comes from the subject's team_members.career_level).
  expected_marker?: boolean;
  // Performance reviews: conditional visibility. The one manager form carries
  // every decision field; `types` limits a field to those review_type values
  // (e.g. the probation decision shows only on a probation review). Absent =
  // always shown. Filtered in the survey page and API (see visibleReviewFields).
  show_when?: { types?: string[] };
};

export type SurveyRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  is_anonymous: boolean;
  intro_text: string | null;
  thank_you_text: string | null;
  purpose: string | null;
  created_at: string;
  updated_at: string;
};

export type SurveyFieldRow = {
  id: string;
  survey_id: string;
  position: number;
  type: string;
  label: string;
  help_text: string | null;
  required: boolean;
  config: FieldConfig | null;
};

export function ratingBounds(config: FieldConfig | null): { min: number; max: number } {
  const min = typeof config?.min === "number" && Number.isInteger(config.min) ? config.min : 1;
  const max = typeof config?.max === "number" && Number.isInteger(config.max) ? config.max : 5;
  return max > min ? { min, max } : { min: 1, max: 5 };
}

export function isNpsConfig(config: FieldConfig | null): boolean {
  const { min, max } = ratingBounds(config);
  return min === 0 && max === 10;
}

// The selfie collected at onboarding is an ordinary profile photo (it becomes
// the person's public avatar), so it is deliberately NOT treated as sensitive —
// unlike the ID-card scans, which are.
export const SELFIE_MAPS_TO = "people_sensitive.id_selfie_path";

// A field's answer destination, when the survey declares one (onboarding maps
// each answer to a people/people_sensitive column). Ordinary surveys have none.
export function surveyFieldMapsTo(field: Pick<SurveyFieldRow, "config">): string | null {
  const m = field.config?.maps_to;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

// Whether an answer is restricted PII that must not be shown in survey views.
// Reuses the existing boundary — the `people_sensitive` store the NL->SQL
// assistant is walled off from and the profile hides behind a reveal — rather
// than a bespoke list. The selfie is exempt (it is a public profile photo).
export function isSensitiveSurveyField(field: Pick<SurveyFieldRow, "config">): boolean {
  const m = surveyFieldMapsTo(field);
  if (!m || m === SELFIE_MAPS_TO) return false;
  return m.startsWith("people_sensitive.");
}

// Builder input → validated config for the field type.
export function normalizeConfig(
  type: FieldType,
  input: { choicesText?: string; min?: number; max?: number; minLabel?: string; maxLabel?: string },
): { ok: true; config: FieldConfig } | { ok: false; error: string } {
  if (type === "single_choice" || type === "multi_choice") {
    const choices = (input.choicesText ?? "")
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    const unique = [...new Set(choices)];
    if (unique.length < 2) return { ok: false, error: "Choice questions need at least 2 options." };
    if (unique.length > 20) return { ok: false, error: "Choice questions are capped at 20 options." };
    return { ok: true, config: { choices: unique } };
  }
  if (type === "rating") {
    const min = input.min ?? 1;
    const max = input.max ?? 5;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 10 || max <= min)
      return { ok: false, error: "Rating needs integer bounds between 0 and 10, with max above min." };
    const config: FieldConfig = { min, max };
    if (input.minLabel?.trim()) config.min_label = input.minLabel.trim();
    if (input.maxLabel?.trim()) config.max_label = input.maxLabel.trim();
    return { ok: true, config };
  }
  return { ok: true, config: {} };
}

// ---- answer validation (shared by the public API and any future importers) ----

export type AnswerValue = string | string[] | number | boolean;

export type ValidatedAnswer =
  | { ok: true; skip: true }
  | { ok: true; skip?: undefined; text: string; json: AnswerValue | null }
  | { ok: false; error: string };

const isEmpty = (raw: unknown) =>
  raw === undefined ||
  raw === null ||
  (typeof raw === "string" && raw.trim() === "") ||
  (Array.isArray(raw) && raw.length === 0);

export function validateAnswer(field: SurveyFieldRow, raw: unknown): ValidatedAnswer {
  if (isEmpty(raw)) {
    if (field.required) return { ok: false, error: `"${field.label}" is required.` };
    return { ok: true, skip: true };
  }

  switch (field.type as FieldType) {
    case "short_text": {
      if (typeof raw !== "string") return { ok: false, error: `"${field.label}" expects text.` };
      const text = raw.trim().slice(0, 500);
      return { ok: true, text, json: null };
    }
    case "long_text": {
      if (typeof raw !== "string") return { ok: false, error: `"${field.label}" expects text.` };
      const text = raw.trim().slice(0, 5000);
      return { ok: true, text, json: null };
    }
    case "single_choice": {
      const choices = field.config?.choices ?? [];
      if (typeof raw !== "string" || !choices.includes(raw))
        return { ok: false, error: `"${field.label}" got an invalid option.` };
      return { ok: true, text: raw, json: null };
    }
    case "multi_choice": {
      const choices = field.config?.choices ?? [];
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || !choices.includes(v)))
        return { ok: false, error: `"${field.label}" got an invalid option.` };
      const picked = [...new Set(raw as string[])];
      return { ok: true, text: picked.join(", "), json: picked };
    }
    case "rating": {
      const { min, max } = ratingBounds(field.config);
      const n = typeof raw === "string" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max)
        return { ok: false, error: `"${field.label}" expects a number between ${min} and ${max}.` };
      return { ok: true, text: String(n), json: n };
    }
    case "yes_no": {
      if (typeof raw !== "boolean") return { ok: false, error: `"${field.label}" expects yes or no.` };
      return { ok: true, text: raw ? "Yes" : "No", json: raw };
    }
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()))
        return { ok: false, error: `"${field.label}" expects a date (YYYY-MM-DD).` };
      const d = raw.trim();
      // Reject impossible dates (e.g. 2026-13-40) that pass the shape check.
      if (Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()))
        return { ok: false, error: `"${field.label}" is not a real date.` };
      return { ok: true, text: d, json: d };
    }
    case "file": {
      // The runner uploads the file first (via /api/surveys/[slug]/upload) and
      // submits the returned object path as the answer. We only see the path.
      if (typeof raw !== "string" || raw.trim() === "")
        return { ok: false, error: `"${field.label}" needs a file upload.` };
      const path = raw.trim().slice(0, 500);
      return { ok: true, text: path, json: path };
    }
    default:
      return { ok: false, error: `Unsupported question type "${field.type}".` };
  }
}

// Stored answer → typed value for aggregation. Pre-existing rows only ever set
// `value` (text), so fall back to coercing it.
export function parseStoredAnswer(
  field: SurveyFieldRow,
  row: { value: string | null; value_json: unknown },
): AnswerValue | null {
  if (row.value_json !== null && row.value_json !== undefined) return row.value_json as AnswerValue;
  if (row.value === null) return null;
  switch (field.type as FieldType) {
    case "rating": {
      const n = Number(row.value);
      return Number.isFinite(n) ? n : null;
    }
    case "yes_no":
      return row.value === "Yes";
    case "multi_choice":
      return row.value.split(", ").filter(Boolean);
    default:
      return row.value;
  }
}
