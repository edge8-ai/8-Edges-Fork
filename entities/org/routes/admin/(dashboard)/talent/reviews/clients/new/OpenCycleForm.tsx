"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { OpenCycleProposal, Option, ProposedMember } from "@/entities/org/lib/client-reviews/proposal";
import { openCycleAction } from "./actions";

// The open-cycle form (CR.2.5), as the CR.2.1 prototype drew it: the cycle's
// details, who is reviewed with each one's client manager, and what opening
// does. The proposal comes from the server; this only holds the corrections.
// The server action guards itself; `may` only hides what it would refuse
// (ADR 0014).

type Row = ProposedMember & { on: boolean };

export function OpenCycleForm({
  may,
  clients,
  client,
  frameworks,
  proposal,
  team,
  defaultName,
}: {
  may: MayProp;
  clients: Option[];
  client: Option | null;
  frameworks: Option[];
  proposal: OpenCycleProposal | null;
  /** Everyone on the team, to add someone with no placement at the client. */
  team: Option[];
  defaultName: string;
}) {
  const router = useRouter();
  const [frameworkId, setFrameworkId] = useState(frameworks[0]?.id ?? "");
  const [name, setName] = useState(defaultName);
  const [skip, setSkip] = useState(proposal?.skipManagerPersonId ?? "");
  const [rows, setRows] = useState<Row[]>(() => (proposal?.members ?? []).map((m) => ({ ...m, on: true })));
  const [adding, setAdding] = useState("");
  const [error, setError] = useState<{ message: string; cycleId?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (!may["org.reviews"]) return null;

  const contacts = proposal?.contacts ?? [];
  const ticked = rows.filter((r) => r.on);
  const listed = new Set(rows.map((r) => r.teamMemberId));
  const candidates = team.filter((t) => !listed.has(t.id));
  const n = ticked.length;
  const people = `${n} ${n === 1 ? "member" : "members"}`;

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function add() {
    const t = team.find((m) => m.id === adding);
    if (!t) return;
    setRows((rs) => [...rs, { teamMemberId: t.id, name: t.name, clientManagerPersonId: null, on: true }]);
    setAdding("");
  }

  function open() {
    if (!client) return;
    setError(null);
    startTransition(async () => {
      const r = await openCycleAction({
        companyId: client.id,
        frameworkId,
        name,
        skipManagerPersonId: skip || null,
        members: ticked.map((m) => ({ teamMemberId: m.teamMemberId, clientManagerPersonId: m.clientManagerPersonId })),
      });
      if (!r.ok) setError({ message: r.error, cycleId: r.cycleId });
      else router.push(`/admin/talent/reviews/clients/${r.cycleId}`);
    });
  }

  return (
    <div className="cr-open-grid">
      <div className="u-stack u-gap-4">
        <section className="admin-card u-p-4 u-grid-2 u-gap-4" aria-label="Cycle details">
          <label className="admin-field u-m-0">
            <span className="admin-label">Client</span>
            <select className="admin-input" value={client?.id ?? ""} onChange={(e) => router.push(e.target.value ? `?client=${e.target.value}` : "?")}>
              <option value="">Choose a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field u-m-0">
            <span className="admin-label">Framework</span>
            <select className="admin-input" value={frameworkId} onChange={(e) => setFrameworkId(e.target.value)}>
              {frameworks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="admin-hint u-m-0">A framework belongs to no client, so each period reuses the same pair of forms.</span>
          </label>
          <label className="admin-field u-m-0">
            <span className="admin-label">Name</span>
            <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="admin-field u-m-0">
            <span className="admin-label">Skip-manager</span>
            <select className="admin-input" value={skip} onChange={(e) => setSkip(e.target.value)} disabled={!client}>
              <option value="">No skip-manager</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="admin-hint u-m-0">
              {skip
                ? proposal?.skipManagerPersonId === skip
                  ? "Proposed from the last cycle. Release waits for their Reviewed mark."
                  : "Release waits for their Reviewed mark."
                : "Release waits for nobody: a review is ready once its client manager has sent their part."}
            </span>
          </label>
        </section>

        {client && (
          <section className="admin-card u-p-4" aria-labelledby="cr-open-who">
            <div className="u-row u-between u-gap-3 u-wrap u-mb-3">
              <div>
                <h2 id="cr-open-who" className="admin-label u-m-0">
                  Who is reviewed
                </h2>
                <p className="admin-hint u-m-0">
                  Proposed from {client.name}&apos;s active placements, each with the client manager on their placement. Untick anyone out of this cycle.
                </p>
              </div>
              <span className="admin-hint u-m-0">
                {n} of {rows.length} ticked
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="admin-empty">Nobody is placed at {client.name} now. Add the people to review below.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Client manager</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.teamMemberId}>
                        <td>
                          <label className="u-row u-gap-2">
                            <input type="checkbox" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} />
                            <span className={r.on ? "admin-cell-strong" : "admin-cell-muted"}>{r.name}</span>
                          </label>
                        </td>
                        <td>
                          <select
                            className="admin-input"
                            aria-label={`Client manager for ${r.name}`}
                            value={r.clientManagerPersonId ?? ""}
                            disabled={!r.on}
                            onChange={(e) => update(i, { clientManagerPersonId: e.target.value || null })}
                          >
                            <option value="">None yet</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="u-row u-gap-2 u-wrap u-mt-3">
              <label className="admin-field u-m-0 u-flex-1">
                <span className="admin-label">Add someone with no placement at {client.name}</span>
                <select className="admin-input" value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Choose a team member</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="admin-btn admin-btn--sm" disabled={!adding} onClick={add}>
                Add
              </button>
            </div>
          </section>
        )}
      </div>

      <aside className="admin-card u-p-4 u-stack u-gap-3" aria-labelledby="cr-open-does">
        <h2 id="cr-open-does" className="admin-label u-m-0">
          What opening does
        </h2>
        <ul className="admin-notes-list u-m-0">
          <li>Creates a self review for each of the {people}, in the team app beside their other reviews.</li>
          <li>
            Creates one personal link per member for their client manager{skip ? ", and one link for the skip-manager covering everyone" : ""}.
          </li>
          <li>Emails the {people} that their review is open, and reminds those who have not sent it on day 3.</li>
          <li>Leaves these members out of the mid-year review.</li>
        </ul>
        <p className="admin-alert admin-alert--warn u-m-0">
          <strong>No client contact is emailed, messaged or notified.</strong> You copy each link from the overview and send it yourself, once the member has sent their part.
        </p>
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !client || n === 0 || !frameworkId} onClick={open}>
          {pending ? "Opening…" : `Open cycle and email ${people}`}
        </button>
        <span className="admin-hint u-m-0 u-center-text">A name this client already has is not opened twice: add people from that cycle&apos;s overview.</span>
        {error && (
          <p className="admin-alert admin-alert--err u-m-0" role="alert">
            {error.message} {error.cycleId && <Link href={`/admin/talent/reviews/clients/${error.cycleId}`}>Open that cycle</Link>}
          </p>
        )}
      </aside>
    </div>
  );
}
