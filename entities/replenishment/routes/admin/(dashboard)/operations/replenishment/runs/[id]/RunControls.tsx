"use client";

// Sending a checked draft to the scanners, and closing a run (RP.4). Both ask
// first: sending is what lets operators start, and a closed run cannot be
// reopened from here. Beside them, Download offline copy (RP.7), a plain link
// to the route that builds the file, offered whatever the run's status.
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { closeRun, sendRun } from "@/entities/replenishment/lib/run-actions";

const ATOM = "replenishment.runs";

export function RunControls({ may, runId, status, jobs, offlineHref }: { may: MayProp; runId: string; status: "draft" | "sent" | "closed"; jobs: number; offlineHref: string }) {
  const router = useRouter();
  if (!may[ATOM]) return null;
  const download = (
    <a className="admin-btn" href={offlineHref} download>
      Download offline copy
    </a>
  );
  if (status === "closed") return <div className="admin-form-actions">{download}</div>;
  return (
    <div className="admin-form-actions">
      <ConfirmButton
        className="admin-btn"
        label="Close run"
        title="Close this run?"
        body={status === "draft" ? "It will never reach the scanners. Upload the export again to make a new run." : "Operators will no longer see it. Its jobs stay as the record of this round."}
        confirmLabel="Close run"
        onConfirm={() => closeRun(runId)}
        onDone={() => router.refresh()}
      />
      {download}
      {status === "draft" && (
        <ConfirmButton
          className="admin-btn admin-btn--primary"
          label="Send to scanners"
          title="Send this run to the scanners?"
          body={jobs === 0 ? "It has no jobs: operators will see that nothing needs restocking." : `Operators can start on its ${jobs} ${jobs === 1 ? "job" : "jobs"} straight away.`}
          confirmLabel="Send to scanners"
          onConfirm={() => sendRun(runId)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}
