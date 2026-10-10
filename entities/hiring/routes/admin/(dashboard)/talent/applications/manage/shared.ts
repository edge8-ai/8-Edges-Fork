import { type InlineSaveResult } from "@/kernel/ui/InlineEdit";

export type AppManageData = {
  id: string;
  jobReqId: string | null;
  personId: string | null;
  jobReqTitle: string | null;
  candidateName: string | null;
  status: string | null;
  rating: number | null;
  rejectionReason: string | null;
  currentStageId: string | null;
  currentStageName: string | null;
  appliedAt: string | null;
  decidedAt: string | null;
  // sourcing (writes applications)
  source: string | null;
  sourceDetail: string | null;
  referrerId: string | null;
  resumeDocumentId: string | null;
  // person-side profile (edits write to people)
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  headline: string | null;
  currentTitle: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  doNotHire: boolean;
  poolStatus: string | null;
  // recruiter's own assessment for this application (writes applications)
  hrAssessment: string | null;
  // recruiter overrides for the AI-extracted fields (write candidate_profile)
  englishProficiency: string | null;
  noticePeriod: string | null;
  // Salary is super-admin-only (Dave + Mai). These are populated from the
  // restricted candidate_sensitive store ONLY when canViewSalary is true;
  // otherwise they are null and the UI hides the salary row entirely.
  canViewSalary: boolean;
  salaryExpectationCents: number | null;
  salaryExpectationCurrency: string | null;
  aiSalary: string | null;
};

// A stored timestamp -> the YYYY-MM-DD a <input type="date"> expects. The org
// operates in Vietnam, so read the instant as its Ho Chi Minh calendar day; a
// plain UTC slice shows the wrong day for timestamps near midnight. The fixed
// timezone also keeps SSR and client hydration in agreement.
export const APP_TZ = "Asia/Ho_Chi_Minh";

export const toDateInput = (v: string | null): string => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

export const ok = (): InlineSaveResult => ({ ok: true });

// Collapsed height shared by the AI screen and the HR assessment, so the two
// paired reads clamp to the same fixed height with a Show more toggle.
export const AI_COLLAPSED_HEIGHT = 232;

// A "from AI screen" fallback is only worth showing when the AI actually
// extracted something — its schema writes "Not stated"/"Unknown" when it didn't.
export function aiHint(v: string | null): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (["not stated", "unknown", "n/a", "na", "none", "—", "-"].includes(low)) return null;
  return t;
}

export const SALARY_CURRENCIES = ["VND", "USD", "EUR", "GBP", "AUD", "SGD"];
