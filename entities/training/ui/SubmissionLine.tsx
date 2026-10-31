"use client";

// One submission as a line (English Program PR 4): the text, the link, or a
// button that signs a short-lived URL to the uploaded file or recording.
import type { Submission } from "@/entities/training/lib/assignments";

export function SubmissionLine({ submission: s, open }: { submission: Submission | null; open: (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }> }) {
  if (!s) return <span>not yet</span>;
  const openFile = async () => {
    if (!s.storagePath) return;
    const res = await open(s.storagePath);
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
