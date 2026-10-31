"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BACKLOG_STATUSES, PRIORITY_LABEL, effectivePriority, tokenLabel, type BacklogItem, type BacklogStatus } from "@/entities/client-programs/client";
import { teamUpdateRoadmapItem } from "./actions";

// One roadmap item on the hub's Roadmap tab: the same read view the client
// sees, plus team-only controls — a status select and an inline editor for
// title / who / today / build description. The server action re-checks the
// actor's assignment and whitelists fields; this is presentation only.

const STATUS_LABEL: Record<BacklogStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  active: "Active",
  shipped: "Shipped",
  parked: "Parked",
};

// Edge8 people assigned to the client, for the "Assigned to" picker; a name
// that is set but no longer assigned stays selectable so it can be changed.
export function RoadmapItemCard({ item, companyId, assignees = [] }: { item: BacklogItem; companyId: string; assignees?: string[] }) {
  const assigneeOptions = item.who && !assignees.includes(item.who) ? [...assignees, item.who] : assignees;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [who, setWho] = useState(item.who ?? "");
  const [todayState, setTodayState] = useState(item.today_state ?? "");
  const [buildDesc, setBuildDesc] = useState(item.build_desc ?? "");

  // A /team/clients link names this item in the URL hash (client-delivery.ts
  // roadmapItemHref). The browser's own jump to a fragment runs while the page
  // is still streaming, before this item exists, so it never lands; the item
  // brings itself into view once it has mounted instead.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash === `#item-${item.id}`) rootRef.current?.scrollIntoView({ block: "center" });
  }, [item.id]);

  const eff = effectivePriority(item);
  const tok = tokenLabel(item.token_low, item.token_high);

  async function setStatus(status: BacklogStatus) {
    setError(null);
    setBusy(true);
    const r = await teamUpdateRoadmapItem(companyId, item.id, { status });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  async function save() {
    setError(null);
    setBusy(true);
    const r = await teamUpdateRoadmapItem(companyId, item.id, {
      title,
      who,
      today_state: todayState,
      build_desc: buildDesc,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="admin-roadmap-item" id={`item-${item.id}`} ref={rootRef}>
      <div className="admin-roadmap-item-top">
        {item.ref && <span className="admin-roadmap-ref">{item.ref}</span>}
        {editing ? (
          <input
            className="admin-input u-flex-220 u-lg"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
          />
        ) : (
          <span className="admin-roadmap-title">{item.title}</span>
        )}
        <span className={`admin-roadmap-pri ${eff}`}>{PRIORITY_LABEL[eff]}</span>
        <select
          className="admin-select u-w-auto u-sm u-shrink-none"
          value={item.status}
          disabled={busy}
          onChange={(e) => setStatus(e.target.value as BacklogStatus)}
          aria-label="Status"
        >
          {BACKLOG_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button
          type="button"
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() => {
            if (editing) {
              setTitle(item.title);
              setWho(item.who ?? "");
              setTodayState(item.today_state ?? "");
              setBuildDesc(item.build_desc ?? "");
            }
            setEditing(!editing);
          }}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="admin-roadmap-body u-stack">
          <label className="admin-label">
            Assigned to
            <select className="admin-select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Unassigned</option>
              {assigneeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="admin-label">
            Today
            <textarea className="admin-input" rows={2} value={todayState} onChange={(e) => setTodayState(e.target.value)} />
          </label>
          <label className="admin-label">
            What we&apos;d build
            <textarea className="admin-input" rows={3} value={buildDesc} onChange={(e) => setBuildDesc(e.target.value)} />
          </label>
          <div>
            <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-roadmap-body">
          {item.who && <div><span className="k">Assigned to: </span>{item.who}</div>}
          {item.today_state && <div><span className="k">Today: </span>{item.today_state}</div>}
          {item.build_desc && <div><span className="k">What we&apos;d build: </span>{item.build_desc}</div>}
          <div className="admin-roadmap-chips">
            {(item.needs ?? []).map((n) => <span key={n} className="admin-roadmap-chip">{n}</span>)}
            {tok && <span className="admin-roadmap-chip tok">est. {tok} Human Tokens</span>}
            {item.source === "client" && <span className="admin-roadmap-chip client">client proposed</span>}
            {item.client_priority && item.client_priority !== item.edge8_priority && (
              <span className="admin-roadmap-chip client">client set: {PRIORITY_LABEL[item.client_priority]}</span>
            )}
          </div>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err u-mt-2">{error}</div>}
    </div>
  );
}
