"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { formatDate, humanize } from "@/kernel/ui/format";
import { COUNTRIES } from "@/entities/company-os/client";
import { updateTeamMember, createAndAssignPosition, type TeamMemberPatch } from "./actions";

// Client-owned shelf for the Team roster. One drawer at the provider level; a
// row pushes its record into context and every field is inline-editable there.
// Mirrors ContactsShelf — never routed through DataTable's server-rendered
// getRowPreview, where interactive content renders with dead clicks.

export type ShelfManager = { id: string; name: string; current: boolean }; // current: on the chart today, so offered as a manager
export type ShelfPosition = { id: string; title: string; level: string | null; isPeopleManager: boolean };
export type ShelfDepartment = { id: string; name: string };
export type ShelfOptions = {
  managers: ShelfManager[];
  positions: ShelfPosition[];
  departments: ShelfDepartment[];
  workLocations: string[];
};

export type TeamShelfRowData = {
  id: string;
  personId: string | null;
  name: string;
  // people
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  city: string | null;
  country: string | null;
  // team_members
  status: string | null;
  employment_stage: string | null;
  employment_type: string | null;
  work_location: string | null;
  start_date: string | null;
  contract_start_date: string | null;
  probation_ends_on: string | null;
  end_date: string | null;
  termination_reason: string | null;
  manager_id: string | null;
  department_id: string | null;
  position_id: string | null;
  position_title: string | null;
  position_level: string | null;
  is_people_manager: boolean | null;
  // derived, read-only
  portalLabel: string;
  isPast: boolean;
};

const STATUS_OPTIONS = ["active", "pre_start", "on_leave", "notice", "terminated", "alumni"];
const STAGE_OPTIONS = ["pre_boarding", "probation", "full_time", "declined_offer", "rescinded", "failed_probation"];
const TYPE_OPTIONS = ["full_time", "part_time", "contract", "intern", "temp", "advisor"];

// ---------------------------------------------------------------------------
// Provider + clickable row

const ShelfContext = createContext<{ open: (row: TeamShelfRowData) => void } | null>(null);

export function TeamShelfProvider({ options, children }: { options: ShelfOptions; children: ReactNode }) {
  const [selected, setSelected] = useState<TeamShelfRowData | null>(null);

  return (
    <ShelfContext.Provider value={{ open: setSelected }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected?.position_title || "Team member"}
        title={selected?.name || "Team member"}
      >
        {selected && <TeamShelfBody key={selected.id} row={selected} options={options} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function TeamShelfRow({ row, children }: { row: TeamShelfRowData; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  // The row carries role="button"; exclude it from the interactive-element guard
  // so a click on a real control inside the row (not the row itself) doesn't open
  // the shelf, while a click on the row does.
  function hitsInner(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInner(e)) return;
    ctx?.open(row);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInner(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Inline field editors. Each renders a value as a click-to-edit control inside a
// <dd>. Escape cancels the edit without closing the drawer. DetailDrawer's
// Escape-to-close listener lives on `document`, the same node React delegates its
// events to, so plain stopPropagation can't reach it — only
// stopImmediatePropagation on the native event stops that sibling listener.

function stopEsc(e: React.KeyboardEvent) {
  if (e.key === "Escape") e.nativeEvent.stopImmediatePropagation();
}

function EditableText({
  value,
  onSave,
  type = "text",
  placeholder = "Add…",
  listId,
  options,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
  listId?: string;
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className="admin-editable"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value ? value : <span className="admin-editable-empty">{placeholder}</span>}
      </button>
    );
  }
  const commitDraft = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return (
    <>
      <input
        className="admin-input"
        type={type}
        autoFocus
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.nativeEvent.stopImmediatePropagation();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
      {listId && options && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  );
}

function EditableSelect({
  value,
  options,
  onSave,
  render,
  placeholder = "Set…",
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => void;
  render?: (value: string) => ReactNode;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    const shown = value ? (render ? render(value) : humanize(value)) : <span className="admin-editable-empty">{placeholder}</span>;
    return (
      <button type="button" className="admin-editable" onClick={() => setEditing(true)}>
        {shown}
      </button>
    );
  }
  // Preserve an out-of-vocabulary stored value so selecting it back is possible.
  const hasValue = !value || options.some((o) => o.value === value);
  return (
    <select
      className="admin-select"
      autoFocus
      value={value}
      onKeyDown={stopEsc}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setEditing(false);
        if (e.target.value !== value) onSave(e.target.value);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {!hasValue && <option value={value}>{value}</option>}
    </select>
  );
}

function EditableDate({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button type="button" className="admin-editable" onClick={() => setEditing(true)}>
        {value ? formatDate(value) : <span className="admin-editable-empty">Set date…</span>}
      </button>
    );
  }
  return (
    <input
      className="admin-input"
      type="date"
      autoFocus
      value={value}
      onKeyDown={stopEsc}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setEditing(false);
        if (e.target.value !== value) onSave(e.target.value);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Position editor — Title/Level/"manages people" are attributes of the shared
// positions catalog. Editing here repoints team_members.position_id (pick an
// existing title) or creates a new title, never renames a catalog row in place.

function PositionEditor({
  teamMemberId,
  pos,
  setPos,
  options,
  onSaved,
  onError,
}: {
  teamMemberId: string;
  pos: { id: string | null; title: string | null; level: string | null; isPeopleManager: boolean };
  setPos: (p: { id: string | null; title: string | null; level: string | null; isPeopleManager: boolean }) => void;
  options: ShelfPosition[];
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "pick" | "new">("view");
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [newMgr, setNewMgr] = useState(false);
  // Choosing an option unmounts the <select>, whose blur would otherwise fire and
  // reset us to view mode, clobbering the intended pick/new transition.
  const skipBlur = useRef(false);

  const NEW = "__new__";

  // The catalog list is active titles only; make sure the member's current
  // title still appears (and stays selected) even if it has been retired.
  const opts: ShelfPosition[] =
    pos.id && !options.some((o) => o.id === pos.id)
      ? [{ id: pos.id, title: pos.title ?? "(current)", level: pos.level, isPeopleManager: pos.isPeopleManager }, ...options]
      : options;

  async function repoint(positionId: string) {
    setSaving(true);
    const chosen = opts.find((o) => o.id === positionId);
    const res = await updateTeamMember(teamMemberId, { position_id: positionId } as TeamMemberPatch);
    setSaving(false);
    if (!res.ok) return onError(res.error);
    if (chosen) setPos({ id: chosen.id, title: chosen.title, level: chosen.level, isPeopleManager: chosen.isPeopleManager });
    setMode("view");
    onSaved();
  }

  async function createNew() {
    if (!newTitle.trim()) return setMode("view");
    setSaving(true);
    const res = await createAndAssignPosition(teamMemberId, {
      title: newTitle,
      level: newLevel || null,
      isPeopleManager: newMgr,
    });
    setSaving(false);
    if (!res.ok) return onError(res.error);
    setPos({
      id: res.position.id,
      title: res.position.title,
      level: res.position.level,
      isPeopleManager: res.position.is_people_manager,
    });
    setNewTitle("");
    setNewLevel("");
    setNewMgr(false);
    setMode("view");
    onSaved();
  }

  if (mode === "view") {
    return (
      <button type="button" className="admin-editable" onClick={() => setMode("pick")} disabled={saving}>
        {pos.title ? pos.title : <span className="admin-editable-empty">Set title…</span>}
      </button>
    );
  }

  if (mode === "pick") {
    return (
      <select
        className="admin-select"
        autoFocus
        value={pos.id ?? ""}
        onKeyDown={stopEsc}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          setMode("view");
        }}
        onChange={(e) => {
          if (e.target.value === NEW) {
            skipBlur.current = true;
            setMode("new");
          } else if (e.target.value && e.target.value !== pos.id) {
            skipBlur.current = true;
            void repoint(e.target.value);
          } else {
            setMode("view");
          }
        }}
      >
        {!pos.id && <option value="">Set title…</option>}
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
        <option value={NEW}>＋ New title…</option>
      </select>
    );
  }

  // mode === "new"
  return (
    <div className="admin-shelf-newpos" onKeyDown={stopEsc}>
      <input
        className="admin-input"
        autoFocus
        placeholder="New title"
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
      />
      <input
        className="admin-input"
        placeholder="Level (optional)"
        value={newLevel}
        onChange={(e) => setNewLevel(e.target.value)}
      />
      <label className="admin-shelf-newpos-check">
        <input type="checkbox" checked={newMgr} onChange={(e) => setNewMgr(e.target.checked)} />
        <span>Manages people</span>
      </label>
      <div className="admin-shelf-newpos-actions">
        <button type="button" className="admin-btn admin-btn--primary" onClick={() => void createNew()} disabled={saving || !newTitle.trim()}>
          {saving ? "Creating…" : "Create & assign"}
        </button>
        <button type="button" className="admin-btn" onClick={() => setMode("view")} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shelf body

function TeamShelfBody({ row, options }: { row: TeamShelfRowData; options: ShelfOptions }) {
  const router = useRouter();

  // One autosave form for every scalar field (people + team_members). The save
  // callback routes keys to the right table in updateTeamMember and refreshes the
  // list so its cells reflect the edit.
  const { form, field, commit, status } = useAutosave(
    {
      preferred_name: row.preferred_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      linkedin_url: row.linkedin_url ?? "",
      city: row.city ?? "",
      country: row.country ?? "",
      status: row.status ?? "",
      employment_stage: row.employment_stage ?? "",
      employment_type: row.employment_type ?? "",
      work_location: row.work_location ?? "",
      start_date: row.start_date ?? "",
      contract_start_date: row.contract_start_date ?? "",
      probation_ends_on: row.probation_ends_on ?? "",
      end_date: row.end_date ?? "",
      termination_reason: row.termination_reason ?? "",
      manager_id: row.manager_id ?? "",
      department_id: row.department_id ?? "",
    },
    async (patch) => {
      const res = await updateTeamMember(row.id, patch as TeamMemberPatch);
      if (res.ok) router.refresh();
      return res;
    },
  );

  // Position (title/level/manages) is edited separately because a title change
  // may repoint or create a catalog row, not just set a column.
  const [pos, setPos] = useState({
    id: row.position_id,
    title: row.position_title,
    level: row.position_level,
    isPeopleManager: !!row.is_people_manager,
  });
  const [posError, setPosError] = useState<string | null>(null);

  // Bind a form key to an inline editor: update the control (field) and persist
  // (commit) in one step. commit skips the request when the value is unchanged.
  type FormKey = keyof typeof form;
  const save = (k: FormKey) => (v: string) => {
    field(k, v);
    void commit(k, v);
  };
  const val = (k: FormKey) => (form[k] ?? "") as string;

  const managerOptions = [
    { value: "", label: "— None —" },
    ...options.managers.filter((m) => m.id !== row.id && (m.current || m.id === form.manager_id)).map((m) => ({ value: m.id, label: m.current ? m.name : `${m.name} (has left)` })),
  ];
  const departmentOptions = [
    { value: "", label: "— None —" },
    ...options.departments.map((d) => ({ value: d.id, label: d.name })),
  ];
  const countryOptions = [
    { value: "", label: "—" },
    ...(form.country && !(COUNTRIES as readonly string[]).includes(form.country) ? [{ value: form.country, label: form.country }] : []),
    ...COUNTRIES.map((c) => ({ value: c, label: c })),
  ];
  const managerName = options.managers.find((m) => m.id === form.manager_id)?.name ?? null;
  const departmentName = options.departments.find((d) => d.id === form.department_id)?.name ?? null;

  return (
    <div className="admin-shelf-sections">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>

      <dl className="admin-kv admin-kv--editable">
        <dt>Goes by</dt>
        <dd><EditableText value={val("preferred_name")} onSave={save("preferred_name")} /></dd>
        <dt>Email</dt>
        <dd><EditableText value={val("email")} onSave={save("email")} type="email" /></dd>
        <dt>Phone</dt>
        <dd><EditableText value={val("phone")} onSave={save("phone")} type="tel" /></dd>
        <dt>LinkedIn</dt>
        <dd><EditableText value={val("linkedin_url")} onSave={save("linkedin_url")} type="url" placeholder="Add URL…" /></dd>

        <dt>Title</dt>
        <dd>
          <PositionEditor
            teamMemberId={row.id}
            pos={pos}
            setPos={setPos}
            options={options.positions}
            onSaved={() => {
              setPosError(null);
              router.refresh();
            }}
            onError={setPosError}
          />
        </dd>
        <dt>Level</dt>
        <dd className="admin-kv-readonly">{pos.level ? humanize(pos.level) : "—"}</dd>
        <dt>Department</dt>
        <dd>
          <EditableSelect
            value={val("department_id")}
            options={departmentOptions}
            onSave={save("department_id")}
            render={() => departmentName ?? "—"}
            placeholder="Set department…"
          />
        </dd>
        <dt>Manager</dt>
        <dd>
          <EditableSelect
            value={val("manager_id")}
            options={managerOptions}
            onSave={save("manager_id")}
            render={() => managerName ?? "—"}
            placeholder="Set manager…"
          />
        </dd>
        <dt>Manages people</dt>
        <dd className="admin-kv-readonly">{pos.isPeopleManager ? "Yes" : "No"}</dd>

        <dt>Status</dt>
        <dd>
          <EditableSelect
            value={val("status")}
            options={STATUS_OPTIONS.map((v) => ({ value: v, label: humanize(v) }))}
            onSave={save("status")}
            render={(v) => <Badge tone={statusTone(v)}>{humanize(v)}</Badge>}
          />
        </dd>
        <dt>Stage</dt>
        <dd>
          <EditableSelect
            value={val("employment_stage")}
            options={[{ value: "", label: "— None —" }, ...STAGE_OPTIONS.map((v) => ({ value: v, label: humanize(v) }))]}
            onSave={save("employment_stage")}
          />
        </dd>
        <dt>Type</dt>
        <dd>
          <EditableSelect
            value={val("employment_type")}
            options={TYPE_OPTIONS.map((v) => ({ value: v, label: humanize(v) }))}
            onSave={save("employment_type")}
            render={(v) => <Badge tone={v === "contract" ? "pink" : "neutral"}>{humanize(v)}</Badge>}
          />
        </dd>
        <dt>Work location</dt>
        <dd>
          <EditableText
            value={val("work_location")}
            onSave={save("work_location")}
            placeholder="Set location…"
            listId="team-work-locations"
            options={options.workLocations}
          />
        </dd>
        <dt>City</dt>
        <dd><EditableText value={val("city")} onSave={save("city")} placeholder="Add city…" /></dd>
        <dt>Country</dt>
        <dd>
          <EditableSelect
            value={val("country")}
            options={countryOptions}
            onSave={save("country")}
            render={(v) => v}
            placeholder="Set country…"
          />
        </dd>

        <dt>Started</dt>
        <dd><EditableDate value={val("start_date")} onSave={save("start_date")} /></dd>
        <dt>Contract start</dt>
        <dd><EditableDate value={val("contract_start_date")} onSave={save("contract_start_date")} /></dd>
        <dt>Probation ends</dt>
        <dd><EditableDate value={val("probation_ends_on")} onSave={save("probation_ends_on")} /></dd>

        {row.isPast && (
          <>
            <dt>Ended</dt>
            <dd><EditableDate value={val("end_date")} onSave={save("end_date")} /></dd>
            <dt>Reason</dt>
            <dd><EditableText value={val("termination_reason")} onSave={save("termination_reason")} placeholder="Add reason…" /></dd>
          </>
        )}

        <dt>Portal</dt>
        <dd className="admin-kv-readonly">{row.portalLabel}</dd>
      </dl>

      {(status.state === "error" || posError) && (
        <div className="admin-alert admin-alert--err">{posError ?? (status.state === "error" ? status.error : "")}</div>
      )}

      <div>
        <Link href={`/admin/talent/team/${row.id}`} className="admin-btn admin-btn--primary">
          Open full profile
        </Link>
      </div>
    </div>
  );
}
