"use client";
// Issues (AH.8): anything blocking a FAST Goal, as cards grouped by the key
// result it blocks, each with its diagnosis, owner and age, and the buttons
// that deal with it (start solving, solved, drop, assign). It used to be two
// tables, the first usually empty and reading "Nothing here.", which looked
// broken; an empty list now says plainly that nothing is blocking a goal, and
// what was solved last. Solved and dropped issues fold to the latest five.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { PersonSelect } from "@/entities/crm/client";
import type { PersonOption } from "@/entities/crm/client";
import type { IssueRow } from "@/entities/org/client";
import type { MayProp } from "@/kernel/identity/may-prop";
import { setIssueAssignee, setIssueStatus } from "./actions";
import { IssueForm } from "./IssueForm";

const DIAG_BADGE: Record<string, string> = {
  goal: "admin-badge--info",
  system: "admin-badge--warn",
  execution: "admin-badge--pink",
};
const DIAG_WORD: Record<string, string> = { goal: "Goal problem", system: "System problem", execution: "Execution problem" };
const RECENT = 5;
const DAY = 86400000;

const days = (from: string, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / DAY));
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Ho_Chi_Minh" });

export function IssuesBoard({ issues, krs, personNames, teamOptions, may }: { issues: IssueRow[]; krs: { id: string; title: string }[]; personNames: Record<string, string>; teamOptions: PersonOption[]; may: MayProp }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  // The controls show only to a reader who may manage issues (ADR 0014); the
  // actions ask ideas.manage themselves and refuse anyone else.
  const canManage = Boolean(may["ideas.manage"]);
  const krTitle = new Map(krs.map((k) => [k.id, k.title]));
  const personOptions = teamOptions.map((p) => ({ value: p.id, label: p.name }));

  const open = issues.filter((i) => i.status === "open" || i.status === "solving");
  const closed = issues
    .filter((i) => i.status === "solved" || i.status === "dropped")
    .sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at));
  const lastSolved = closed.find((i) => i.status === "solved");
  // Grouped by the goal each blocks, the ones with no key result last.
  const groups = new Map<string, IssueRow[]>();
  for (const i of open) groups.set(i.key_result_id ?? "", [...(groups.get(i.key_result_id ?? "") ?? []), i]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || (krTitle.get(a) ?? "").localeCompare(krTitle.get(b) ?? ""));

  async function run(id: string, write: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyId(id);
    const res = await write();
    setBusyId(null);
    if (!res.ok) setErr(res.error ?? "That didn't go through.");
    else {
      setErr(null);
      startTransition(() => router.refresh());
    }
  }

  const fileButton = canManage && (
    <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setDrawerOpen(true)}>
      File an issue
    </button>
  );

  return (
    <>
      {err && <div className="admin-alert admin-alert--err u-mb-4">{err}</div>}

      {open.length === 0 ? (
        <section className="admin-card admin-section-card issues-empty">
          <h2 className="admin-card-title">Nothing is blocking a goal right now</h2>
          <p className="admin-page-sub">
            {lastSolved?.resolved_at
              ? `The last issue was solved on ${shortDate(lastSolved.resolved_at)}, after ${plural(days(lastSolved.created_at, new Date(lastSolved.resolved_at).getTime()), "day")}.`
              : "No issue has been solved yet."}{" "}
            Agents file one when a number slips. File one yourself when something is in the way of a goal.
          </p>
          {fileButton}
        </section>
      ) : (
        <>
          <div className="admin-toolbar issues-toolbar">
            <span className="admin-page-sub u-m-0">{plural(open.length, "open issue")}, by the goal each blocks.</span>
            {fileButton}
          </div>
          {ordered.map(([kr, rows]) => (
            <section key={kr || "none"} className="admin-card admin-section-card" aria-label={kr ? krTitle.get(kr) : "No key result"}>
              <div className="admin-card-head">
                <h2 className="admin-card-title">{kr ? (krTitle.get(kr) ?? "A key result") : "Not tied to a key result"}</h2>
              </div>
              <div className="admin-list">
                {rows.map((i) => (
                  <div key={i.id} className="admin-list-row issues-row">
                    <span className="admin-list-main">
                      <span className="admin-list-title">{i.title}</span>
                      <span className="admin-list-sub">
                        <span className={`admin-badge ${DIAG_BADGE[i.diagnosis] ?? ""}`}>{DIAG_WORD[i.diagnosis] ?? i.diagnosis}</span> {i.status === "solving" ? "Being solved · " : ""}open {plural(days(i.created_at, now), "day")}
                        {i.filed_by.endsWith(":auto") ? " · filed by an agent" : ` · filed by ${i.filed_by}`}
                      </span>
                      {i.notes_md && <span className="admin-list-sub">{i.notes_md}</span>}
                    </span>
                    {canManage ? (
                    <span className="admin-list-aside admin-list-aside--row issues-acts">
                      <PersonSelect
                        compact
                        ariaLabel={`Owner of ${i.title}`}
                        className="u-min-2"
                        value={i.assignee_person_id ?? ""}
                        disabled={busyId === i.id}
                        onChange={(personId) => personId && run(i.id, () => setIssueAssignee(i.id, personId))}
                        emptyLabel="No owner"
                        options={
                          // Someone assigned before they left is off the roster
                          // but still has to show as the current holder.
                          i.assignee_person_id && !teamOptions.some((p) => p.id === i.assignee_person_id)
                            ? [...personOptions, { value: i.assignee_person_id, label: personNames[i.assignee_person_id] ?? "Former team member" }]
                            : personOptions
                        }
                      />
                      {i.status === "open" && (
                        <button type="button" className="admin-btn admin-btn--sm" disabled={busyId === i.id} onClick={() => run(i.id, () => setIssueStatus(i.id, "solving"))}>
                          Start solving
                        </button>
                      )}
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={busyId === i.id} onClick={() => run(i.id, () => setIssueStatus(i.id, "solved"))}>
                        Solved
                      </button>
                      <button type="button" className="admin-btn admin-btn--sm" disabled={busyId === i.id} onClick={() => run(i.id, () => setIssueStatus(i.id, "dropped"))}>
                        Drop
                      </button>
                    </span>
                    ) : (
                      <span className="admin-list-aside admin-cell-muted">{i.assignee_person_id ? (personNames[i.assignee_person_id] ?? "No owner") : "No owner"}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {closed.length > 0 && (
        <section className="admin-card admin-section-card">
          <div className="admin-card-head">
            <h2 className="admin-card-title">
              Solved and dropped <span className="admin-home-note">{closed.length > RECENT ? `latest ${RECENT} of ${closed.length}` : null}</span>
            </h2>
          </div>
          <div className="admin-list">
            {closed.slice(0, RECENT).map((i) => (
              <div key={i.id} className="admin-list-row">
                <span className="admin-list-main">
                  <span className="admin-list-title">{i.title}</span>
                  <span className="admin-list-sub">
                    {[DIAG_WORD[i.diagnosis] ?? i.diagnosis, i.key_result_id ? krTitle.get(i.key_result_id) : null, i.assignee_person_id ? personNames[i.assignee_person_id] : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="admin-list-aside">
                  <span className={`admin-badge ${i.status === "solved" ? "admin-badge--ok" : ""}`}>
                    {i.status === "solved" && i.resolved_at ? `Solved in ${plural(days(i.created_at, new Date(i.resolved_at).getTime()), "day")}` : i.status === "solved" ? "Solved" : "Dropped"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <DetailDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} eyebrow="Edges" title="File an issue">
        <IssueForm
          krs={krs}
          teamOptions={teamOptions}
          may={may}
          onDone={(res) => {
            if (res.ok) {
              setDrawerOpen(false);
              startTransition(() => router.refresh());
            }
          }}
        />
      </DetailDrawer>
    </>
  );
}
