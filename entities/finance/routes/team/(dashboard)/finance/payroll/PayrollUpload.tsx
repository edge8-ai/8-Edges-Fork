"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PayrollPreview } from "./actions";
import { formatMonth } from "@/kernel/ui/format";

// Upload a month's workbook: first a preview of who it pays and anything that
// stops it saving, then Save. The file is sent again on Save, so what is saved
// is what was previewed.
export function PayrollUpload({
  previewPayroll,
  savePayroll,
}: {
  previewPayroll: (fd: FormData) => Promise<PayrollPreview>;
  savePayroll: (fd: FormData) => Promise<{ ok: true; runId: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rows matched by hand: register row number -> team member.
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();

  const form = (choices: Record<number, string> = picked) => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("picked", JSON.stringify(choices));
    return fd;
  };

  function pick(row: number, teamMemberId: string) {
    const next = { ...picked, [row]: teamMemberId };
    setPicked(next);
    start(async () => setPreview(await previewPayroll(form(next))));
  }

  function read(f: File | null) {
    setFile(f);
    setPreview(null);
    setError(null);
    setPicked({});
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => setPreview(await previewPayroll(fd)));
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await savePayroll(form());
      if (!res.ok) return setError(res.error);
      setFile(null);
      setPreview(null);
      if (input.current) input.current.value = "";
      router.push(`/team/finance/payroll/${res.runId}`);
    });
  }

  const ready = preview?.ok && preview.problems.length === 0;
  return (
    <div>
      <label className="admin-list-sub u-mb-2">
        The month&apos;s workbook, named like &ldquo;9. Payroll Sep 2026.xlsx&rdquo;
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending} onChange={(e) => read(e.target.files?.[0] ?? null)} />
      </label>
      {pending && !preview && <div className="admin-list-sub">Reading the workbook…</div>}
      {preview && !preview.ok && <div className="admin-alert admin-alert--err">{preview.error}</div>}
      {preview?.ok && (
        <div className="u-mb-3">
          <p>
            <strong>{formatMonth(preview.period)}</strong>
            {preview.isEstimate ? " (marked as an estimate)" : ""}: {preview.lines} {preview.lines === 1 ? "person" : "people"} on the register.
            {preview.alreadySaved ? " This month is already saved; saving again replaces it." : ""}
          </p>
          {preview.problems.length > 0 && (
            <div className="admin-alert admin-alert--err">
              Nothing can be saved until every line is matched to a team member. Pick who each of these is:
              <ul>
                {preview.problems.map((p, i) => (
                  <li key={i}>
                    {p.name} (row {p.sourceRow}, {p.why}){" "}
                    <select value={picked[p.sourceRow] ?? ""} disabled={pending} onChange={(e) => pick(p.sourceRow, e.target.value)}>
                      <option value="">Pick a team member…</option>
                      {preview.people.map((m) => (
                        <option key={m.teamMemberId} value={m.teamMemberId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.notes.length > 0 && (
            <ul className="admin-list-sub">
              {preview.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {preview.unknownLabels.length > 0 && <p className="admin-list-sub">Kept as one-off adjustments: {preview.unknownLabels.join("; ")}.</p>}
          <details>
            <summary className="admin-list-sub">Who it pays ({preview.matched.length})</summary>
            <ul className="admin-list-sub">
              {preview.matched.map((m, i) => (
                <li key={i}>
                  {m.name} → {m.matchedName} (by {m.how}{m.kind === "service" ? ", service contract" : ""})
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <button type="button" className="admin-btn admin-btn--primary" disabled={!ready || pending} onClick={save}>
        {pending && preview ? "Saving…" : "Save this month"}
      </button>
    </div>
  );
}
