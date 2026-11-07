// The client-safe side of homework (English Program PR 4): the four kinds and
// their labels, shared by the learner's submitter and the organiser's form.
export const KINDS = ["written", "upload", "link", "recording"] as const;
export type SubmissionKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<SubmissionKind, string> = { written: "Write", upload: "Upload", link: "Link", recording: "Record" };
