"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate } from "@/kernel/ui/format";
import { isRunDay, type BuildAnswerView } from "../lib/run-rules";

// "Build the run for <date>" (decision 6): for a tick the cron missed, the
// payer builds the run by hand. It calls the same function the cron does, so
// pressing it for a run that exists only brings that run up to date, and
// pressing it twice is safe. The action is handed in by the page.

export function BuildRun({ build, defaultDate, hrefBase }: { build: (runDate: string) => Promise<BuildAnswerView>; defaultDate: string; hrefBase: string }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const valid = isRunDay(date);

  const press = () =>
    start(async () => {
      setNote(null);
      const res = await build(date);
      if (!res.ok) return setNote({ tone: "err", text: res.error });
      setNote({ tone: res.built ? "ok" : "info", text: res.message });
      if (res.runId) router.push(`${hrefBase}/${res.runId}`);
      else router.refresh();
    });

  return (
    <div className="u-stack u-gap-1">
      <div className="u-row u-gap-1 u-wrap u-items-end">
        <div className="admin-field">
          <label className="admin-label" htmlFor="run-date">
            Run date (the 1st or the 15th)
          </label>
          <input id="run-date" type="date" className="admin-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="button" className="admin-btn" disabled={pending || !valid} onClick={press}>
          {pending ? "Building…" : valid ? `Build the run for ${formatDate(date)}` : "Pick a 1st or a 15th"}
        </button>
      </div>
      <span className="admin-hint">The run builds itself at 08:00 Vietnam time on the 1st and the 15th. Use this only if it did not.</span>
      {note && (
        <div className={`admin-alert admin-alert--${note.tone}`} role={note.tone === "err" ? "alert" : "status"}>
          {note.text}
        </div>
      )}
    </div>
  );
}
