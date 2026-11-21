"use client";

// One submission as a line (English Program PR 4): the text, the link, or a
// button that asks for a short-lived URL to the uploaded file or recording.
// The host says how that link is asked for: a learner's page asks for their
// own file, an organiser's page names the submission (TR.21), so this line
// never hands a storage path to anyone.
import type { Submission } from "@/entities/training/lib/assignments";

export type OpenSubmissionFile = () => Promise<{ ok: true; url: string } | { ok: false; error: string }>;

export function SubmissionLine({ submission: s, open }: { submission: Submission | null; open: OpenSubmissionFile }) {
  if (!s) return <span>not yet</span>;
  const openFile = async () => {
    if (!s.storagePath) return;
    const res = await open();
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else window.alert(res.error);
  };
  if (s.kind === "written") return <span title={s.text ?? ""}>written · {(s.text ?? "").slice(0, 80)}{(s.text ?? "").length > 80 ? "…" : ""}</span>;
  if (s.kind === "link")
    return (
      <a href={s.url ?? "#"} target="_blank" rel="noopener noreferrer">
        link · open
      </a>
    );
  return (
    <button type="button" className="tr-linklike" onClick={openFile}>
      {s.kind} · open
    </button>
  );
}
