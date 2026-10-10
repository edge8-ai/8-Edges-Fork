"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { showToast, type ToastResult } from "@/kernel/ui/Toast";
import type { OpenRole, OrgEntry } from "@/entities/org/lib/directory-shapes";
import { buildOrgModel, managerChain, matchesQuery } from "@/entities/org/lib/org-tree";
import { OrgTree, type Selection } from "./OrgTree";
import { OrgPanel } from "./OrgPanel";
import { useZoomPan } from "./useZoomPan";
import { handleTreeKey } from "./treeKeys";

// The org chart shared by /team/org and /admin/company/org: Dave's top-down
// tree on a pan-and-zoom canvas, with search, a location filter, collapsible
// branches and a side panel. Given `onSetReportingLine` (an admin holding
// org.people) it adds an edit mode that changes who someone reports to, with
// Undo. `personHrefBase` points the panel's profile link at each surface's own
// person page.

type Props = {
  entries: OrgEntry[];
  openRoles: OpenRole[];
  personHrefBase: string;
  roleHrefBase?: string;
  viewerId?: string | null;
  showGaps?: boolean;
  onSetReportingLine?: (teamMemberId: string, managerId: string | null) => Promise<ToastResult>;
};

const PANEL_WIDTH = 320;
const NO_MOVES: Record<string, string | null> = {};

export function OrgChart({ entries, openRoles, personHrefBase, roleHrefBase, viewerId = null, showGaps = false, onSetReportingLine }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [gapsOpen, setGapsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Saved changes, laid over the server's rows so the tree redraws the moment
  // the action answers. The overlay belongs to the rows it was made against:
  // once the refresh brings new rows, the server's answer wins, including a
  // later change by someone else.
  const [moved, setMoved] = useState<{ base: OrgEntry[]; byId: Record<string, string | null> }>({ base: entries, byId: {} });
  const overlay = moved.base === entries ? moved.byId : NO_MOVES;
  const remember = (id: string, managerId: string | null) =>
    setMoved((m) => ({ base: entries, byId: { ...(m.base === entries ? m.byId : {}), [id]: managerId } }));

  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const panelOpen = Boolean(selected) || gapsOpen;
  const { zoom, setZoom, fit, centerOn } = useZoomPan(canvasRef, stageRef, innerRef, panelOpen ? PANEL_WIDTH : 0);

  const people = useMemo(
    () => entries.map((e) => (e.id in overlay ? { ...e, managerId: overlay[e.id] } : e)),
    [entries, overlay],
  );
  const model = useMemo(() => buildOrgModel(people, openRoles), [people, openRoles]);
  const locations = useMemo(
    () => [...new Set(entries.map((e) => e.location).filter((x): x is string => !!x))].sort(),
    [entries],
  );
  const filtering = query.trim() !== "" || location !== "all";
  const matches = (e: OrgEntry) => matchesQuery(e, query, location);
  const matchCount = filtering ? people.filter(matches).length : 0;

  const cardFor = (sel: Selection) =>
    innerRef.current?.querySelector<HTMLElement>(sel.kind === "person" ? `[data-person="${sel.id}"]` : `[data-role="${sel.id}"]`) ?? null;

  // Opening a person also opens every branch above them, so the card exists to scroll to.
  function select(sel: Selection) {
    setGapsOpen(false);
    setSelected(sel);
    if (sel.kind === "person") {
      const up = new Set(managerChain(model, sel.id).map((m) => m.id));
      setCollapsed((c) => new Set([...c].filter((id) => !up.has(id))));
    }
    requestAnimationFrame(() => centerOn(cardFor(sel)));
  }
  // Closing hands focus back to the card the panel was about.
  const close = () => {
    const back = selected && cardFor(selected);
    setSelected(null);
    setGapsOpen(false);
    back?.focus({ preventScroll: true });
  };
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function setManager(teamMemberId: string, managerId: string | null) {
    if (!onSetReportingLine) return;
    const prev = model.byId.get(teamMemberId)?.managerId ?? null;
    setSaving(true);
    const res = await onSetReportingLine(teamMemberId, managerId);
    setSaving(false);
    if (!res.ok) {
      showToast({ message: res.error });
      return;
    }
    remember(teamMemberId, managerId);
    const name = model.byId.get(teamMemberId)?.name ?? "They";
    const to = managerId ? model.byId.get(managerId)?.name : null;
    const message = to ? `${name} now reports to ${to}.` : `${name} now has no manager.`;
    // Undo puts the old manager back, which the server allows only while that
    // person is on the chart; when they have left, offering Undo would only
    // end in a refusal, so the toast says why instead.
    const canUndo = !prev || model.byId.has(prev);
    showToast({
      message: canUndo ? message : `${message} Their previous manager has left, so this can't be undone here.`,
      action: canUndo
        ? {
            label: "Undo",
            run: async () => {
              const undo = await onSetReportingLine(teamMemberId, prev);
              if (undo.ok) remember(teamMemberId, prev);
              return undo;
            },
          }
        : undefined,
      onActionDone: () => router.refresh(),
    });
    router.refresh();
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setQuery("");
    if (e.key === "Enter") {
      const hit = people.filter(matches).sort((a, b) => a.name.localeCompare(b.name))[0];
      if (hit) select({ kind: "person", id: hit.id });
    }
  }
  function onQuery(value: string) {
    setQuery(value);
    // Bring the first match into view once the dimming has rendered.
    requestAnimationFrame(() => {
      const hit = innerRef.current?.querySelector<HTMLElement>(".admin-org-card.is-match");
      if (hit && value.trim()) centerOn(hit, 0.9);
    });
  }

  return (
    <>
      <div className="admin-org-tools" role="search">
        <div className="admin-org-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <label htmlFor="admin-org-q" className="admin-org-sr-only">Find a person</label>
          <input id="admin-org-q" type="search" placeholder="Find a person, role or city" autoComplete="off" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={onSearchKey} />
        </div>
        <label htmlFor="admin-org-loc" className="admin-org-sr-only">Location</label>
        <select id="admin-org-loc" className="admin-org-select" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        {(showGaps || onSetReportingLine) && (
          <div className="admin-org-head-actions">
            {showGaps && (
              <button type="button" className="admin-org-btn" onClick={() => { setSelected(null); setGapsOpen(true); }}>
                Record gaps
              </button>
            )}
            {onSetReportingLine && (
              <button type="button" className={`admin-org-btn${editing ? " is-primary" : ""}`} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? "Done editing" : "Edit reporting lines"}
              </button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="admin-org-banner">Pick a person, then choose who they report to. Each change saves straight away and can be undone.</div>
      )}
      <div className="admin-org-status" aria-live="polite">
        {filtering && (
          <>
            {matchCount === 0 ? "No one matches" : `${matchCount} ${matchCount === 1 ? "person matches" : "people match"}`}
            {query.trim() ? ` “${query.trim()}”` : ""}
            {location !== "all" ? ` in ${location}` : ""} ·{" "}
            <button type="button" className="admin-org-link" onClick={() => { setQuery(""); setLocation("all"); }}>
              Clear
            </button>
          </>
        )}
      </div>
      <div className="admin-org-wrap" onKeyDown={(e) => { if (e.key === "Escape" && panelOpen) close(); }}>
        <div className="admin-org-canvas" ref={canvasRef}>
          <div className="admin-org-stage" ref={stageRef}>
            <div className="admin-org-inner" ref={innerRef} onKeyDown={(e) => handleTreeKey(e, innerRef.current, model, collapsed, toggle)}>
              <OrgTree model={model} collapsed={collapsed} filtering={filtering} matches={matches} selected={selected} viewerId={viewerId} onSelect={select} onToggle={toggle} />
            </div>
          </div>
        </div>
        <div className="admin-org-zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={fit} title="Fit to screen">Fit</button>
          <span className="admin-org-zoom-sep" />
          <button type="button" onClick={() => setZoom(zoom - 0.1)} aria-label="Zoom out">−</button>
          <output aria-live="polite">{Math.round(zoom * 100)}%</output>
          <button type="button" onClick={() => setZoom(zoom + 0.1)} aria-label="Zoom in">+</button>
          <span className="admin-org-zoom-sep" />
          <button type="button" onClick={() => setZoom(1)} title="Actual size">100%</button>
        </div>
        <div className="admin-org-keys">Drag to pan · ← → close and open a branch · ↑ ↓ move · Ctrl + scroll zooms</div>
        <OrgPanel
          model={model}
          selected={selected}
          showGaps={gapsOpen}
          viewerId={viewerId}
          personHrefBase={personHrefBase}
          roleHrefBase={roleHrefBase}
          editing={editing}
          saving={saving}
          onSelect={select}
          onClose={close}
          onSetManager={onSetReportingLine ? setManager : undefined}
          onFixPerson={(id) => { setEditing(true); select({ kind: "person", id }); }}
        />
      </div>
    </>
  );
}
