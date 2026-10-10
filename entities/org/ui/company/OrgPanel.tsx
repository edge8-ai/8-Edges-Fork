import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import type { OpenRole, OrgEntry } from "@/entities/org/lib/directory-shapes";
import { descendantsOf, managerChain, type OrgModel } from "@/entities/org/lib/org-tree";
import { EMPLOYMENT_LABEL, OrgAvatar, type Selection } from "./OrgTree";

// The org chart's side panel (a bottom sheet on a phone): who a person reports
// to, who reports to them and who they work alongside; an open role's details;
// or, for an admin, the records that keep the tree from being right.

export type PanelProps = {
  model: OrgModel;
  selected: Selection | null;
  showGaps: boolean;
  viewerId: string | null;
  personHrefBase: string;
  /** Admin only: where an open role's requisition is edited. */
  roleHrefBase?: string;
  editing: boolean;
  saving: boolean;
  onSelect: (sel: Selection) => void;
  onClose: () => void;
  onSetManager?: (teamMemberId: string, managerId: string | null) => void;
  onFixPerson: (teamMemberId: string) => void;
};

const first = (name: string) => name.split(/\s+/)[0];
const byName = (a: OrgEntry, b: OrgEntry) => a.name.localeCompare(b.name);

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="admin-org-x" onClick={onClose} aria-label="Close details">
      ×
    </button>
  );
}

function PeopleList({ people, onSelect }: { people: OrgEntry[]; onSelect: PanelProps["onSelect"] }) {
  return (
    <ul className="admin-org-mini">
      {people.map((x) => (
        <li key={x.id}>
          <button type="button" className="admin-org-person" onClick={() => onSelect({ kind: "person", id: x.id })}>
            <OrgAvatar entry={x} />
            <span className="admin-org-tx">
              <span className="admin-org-nm">{x.name}</span>
              <span className="admin-org-ti">{x.positionTitle ?? ""}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ManagerPicker({ p, entry }: { p: PanelProps; entry: OrgEntry }) {
  const below = descendantsOf(p.model, entry.id);
  const options = [...p.model.byId.values()].filter((x) => x.id !== entry.id).sort(byName);
  return (
    <div className="admin-org-field">
      <label htmlFor="admin-org-manager">Reports to</label>
      <select
        id="admin-org-manager"
        className="admin-org-select"
        value={entry.managerId && p.model.byId.has(entry.managerId) ? entry.managerId : ""}
        disabled={p.saving}
        onChange={(e) => p.onSetManager?.(entry.id, e.target.value || null)}
      >
        <option value="">No manager (top of the chart)</option>
        {options.map((x) => (
          <option key={x.id} value={x.id} disabled={below.has(x.id)}>
            {below.has(x.id) ? `${x.name} (in ${first(entry.name)}'s team)` : `${x.name}${x.positionTitle ? ` · ${x.positionTitle}` : ""}`}
          </option>
        ))}
      </select>
      <p className="admin-org-help">
        Only people on the chart today. Anyone in {first(entry.name)}&apos;s own team is greyed out, because that would make a loop.
      </p>
    </div>
  );
}

function PersonPanel({ p, entry }: { p: PanelProps; entry: OrgEntry }) {
  const chain = managerChain(p.model, entry.id);
  const direct = p.model.kids.get(entry.id) ?? [];
  const peers = entry.managerId ? (p.model.kids.get(entry.managerId) ?? []).filter((x) => x.id !== entry.id) : [];
  const you = entry.id === p.viewerId;
  const inLoop = p.model.loose.some((x) => x.id === entry.id);
  return (
    <>
      <div className="admin-org-panel-h">
        <OrgAvatar entry={entry} large you={you} />
        <div className="admin-org-panel-who">
          <h2>
            {entry.name}
            {you && <span className="admin-org-you">You</span>}
          </h2>
          <p>{entry.positionTitle ?? "No title yet"}</p>
          {entry.legalName && entry.legalName !== entry.name && <p className="admin-org-legal">{entry.legalName}</p>}
        </div>
        <CloseButton onClose={p.onClose} />
      </div>
      <dl className="admin-org-kv">
        <dt>Department</dt>
        <dd>{entry.departmentName ?? "—"}</dd>
        <dt>Location</dt>
        <dd>{entry.location ?? "—"}</dd>
        <dt>Works as</dt>
        <dd>{(entry.employmentType && EMPLOYMENT_LABEL[entry.employmentType]) || "—"}</dd>
      </dl>
      {p.editing && p.onSetManager ? (
        <ManagerPicker p={p} entry={entry} />
      ) : (
        <div>
          <h3 className="admin-org-h3">Reports to</h3>
          {chain.length ? (
            <div className="admin-org-chain">
              {chain.map((c) => (
                <Fragment key={c.id}>
                  <button type="button" className="admin-org-link" onClick={() => p.onSelect({ kind: "person", id: c.id })}>
                    {c.name}
                  </button>
                  <span aria-hidden="true">›</span>
                </Fragment>
              ))}
              <b>{first(entry.name)}</b>
            </div>
          ) : (
            <p className="admin-org-empty">{inLoop ? "Their manager line goes round in a loop." : "Top of the chart."}</p>
          )}
        </div>
      )}
      <div>
        <h3 className="admin-org-h3">Direct reports</h3>
        {direct.length ? <PeopleList people={direct} onSelect={p.onSelect} /> : <p className="admin-org-empty">No one reports to {first(entry.name)}.</p>}
      </div>
      {peers.length > 0 && (
        <div>
          <h3 className="admin-org-h3">Works alongside</h3>
          <PeopleList people={peers} onSelect={p.onSelect} />
        </div>
      )}
      <div className="admin-org-head-actions">
        <Link className="admin-org-btn" href={`${p.personHrefBase}${entry.id}`}>
          {p.roleHrefBase ? "Open in Talent" : "Open profile"}
        </Link>
      </div>
    </>
  );
}

function RolePanel({ p, role }: { p: PanelProps; role: OpenRole }) {
  const hm = [...p.model.byId.values()].find((x) => x.personId === role.hiringManagerPersonId);
  return (
    <>
      <div className="admin-org-panel-h">
        <span className="admin-org-av is-large" aria-hidden="true">+</span>
        <div>
          <h2>{role.title}</h2>
          <p>Open role</p>
        </div>
        <CloseButton onClose={p.onClose} />
      </div>
      <dl className="admin-org-kv">
        <dt>Hiring manager</dt>
        <dd>{hm ? hm.name : "Not set yet"}</dd>
        <dt>Location</dt>
        <dd>{role.location ?? "—"}</dd>
        <dt>Works as</dt>
        <dd>{(role.employmentType && EMPLOYMENT_LABEL[role.employmentType]) || "—"}</dd>
        <dt>Posting</dt>
        <dd>{role.isPublic ? "Public careers page" : "Internal, no public page"}</dd>
      </dl>
      <div className="admin-org-head-actions">
        {p.roleHrefBase ? (
          <Link className="admin-org-btn" href={`${p.roleHrefBase}${role.id}`}>
            Open the job
          </Link>
        ) : (
          role.isPublic &&
          role.slug && (
            <a className="admin-org-btn" href={`/careers/${role.slug}/`} target="_blank" rel="noreferrer">
              Read the posting
            </a>
          )
        )}
      </div>
    </>
  );
}

// A gap's fix opens the edit mode on that person, for an admin who may change
// reporting lines; anyone else gets the Talent record, where the field lives,
// rather than a button that would do nothing.
function FixButton({ p, id, label }: { p: PanelProps; id: string; label: string }) {
  if (!p.onSetManager) {
    return (
      <Link className="admin-org-btn is-small" href={`${p.personHrefBase}${id}`}>
        Open in Talent
      </Link>
    );
  }
  return (
    <button type="button" className="admin-org-btn is-small" onClick={() => p.onFixPerson(id)}>
      {label}
    </button>
  );
}

function GapsPanel({ p }: { p: PanelProps }) {
  const { model } = p;
  const extraRoots = model.roots.slice(1);
  const empty = !model.unplacedRoles.length && !extraRoots.length && !model.loose.length;
  return (
    <>
      <div className="admin-org-panel-h">
        <div>
          <h2 className="is-compact">Record gaps</h2>
          <p className="admin-org-help">These records need a decision before the tree can be right.</p>
        </div>
        <CloseButton onClose={p.onClose} />
      </div>
      {empty ? (
        <p className="admin-org-empty">Nothing to fix. Everyone on the chart connects to the top, and every open role has a hiring manager.</p>
      ) : (
        <ul className="admin-org-gaps">
          {model.unplacedRoles.map((r) => (
            <li key={r.id}>
              <p>
                <b>{r.title}</b> has no hiring manager on the chart, so it sits below the tree.
              </p>
              {p.roleHrefBase && (
                <div>
                  <Link className="admin-org-btn is-small" href={`${p.roleHrefBase}${r.id}`}>
                    Set it on the job
                  </Link>
                </div>
              )}
            </li>
          ))}
          {extraRoots.map((e) => (
            <li key={e.id}>
              <p>
                <b>{e.name}</b> has no manager on the chart, so they sit at the top beside {model.roots[0].name}.
              </p>
              <div>
                <FixButton p={p} id={e.id} label="Pick a manager" />
              </div>
            </li>
          ))}
          {model.loose.length > 0 && (
            <li>
              <p>
                <b>{model.loose.map((e) => e.name).join(", ")}</b> {model.loose.length === 1 ? "is" : "are"} in a manager loop, so no line reaches the top.
              </p>
              <div>
                <FixButton p={p} id={model.loose[0].id} label="Fix the loop" />
              </div>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

export function OrgPanel(p: PanelProps) {
  const person = p.selected?.kind === "person" ? p.model.byId.get(p.selected.id) : undefined;
  const role =
    p.selected?.kind === "role"
      ? [...p.model.unplacedRoles, ...[...p.model.byId.values()].flatMap((e) => p.model.rolesFor(e.personId))].find((r) => r.id === p.selected?.id)
      : undefined;
  // Opening the panel, or switching what it shows, moves focus into it, so a
  // keyboard or screen-reader user lands on the details rather than having to
  // tab past the whole tree. Escape (handled by the chart) closes it.
  const showing = person?.id ?? role?.id ?? (p.showGaps ? "gaps" : null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (showing) ref.current?.focus({ preventScroll: true });
  }, [showing]);
  if (!showing) return null;
  return (
    <>
      <div className="admin-org-scrim" onClick={p.onClose} aria-hidden="true" />
      <aside className="admin-org-panel" role="dialog" aria-label="Details" tabIndex={-1} ref={ref}>
        <div className="admin-org-grab" aria-hidden="true" />
        {person ? <PersonPanel p={p} entry={person} /> : role ? <RolePanel p={p} role={role} /> : <GapsPanel p={p} />}
      </aside>
    </>
  );
}
