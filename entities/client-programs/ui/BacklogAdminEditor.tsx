"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BACKLOG_PRIORITIES, BACKLOG_STATUSES, PRIORITY_LABEL, tokenLabel, type BacklogItem, type BacklogPriority, type RoadmapGroup } from "@/entities/client-programs/lib/client-backlog";
import type { RoadmapActions, RoadmapGroupInput } from "./roadmap-actions-contract";
import { AssigneeSelect } from "./AssigneeSelect";
import { draftToInput, itemToDraft, type Draft } from "@/entities/client-programs/lib/backlog-draft";

type GroupDraft = { step_label: string; title: string; intro: string };

export function BacklogAdminEditor({
  companyId,
  groups,
  items,
  showArchived,
  liveCardItemIds,
  programs = [],
  defaultProgramId,
  assignees = [],
  actions,
}: {
  companyId: string;
  // The roadmap writes, handed down by the server page rather than imported:
  // see ui/roadmap-actions-contract.ts.
  actions: RoadmapActions;
  // Edge8 people assigned to this client: the "Assigned to" choices. An item
  // assigned to someone no longer on the list keeps its name as an option.
  assignees?: string[];
  groups: RoadmapGroup[];
  items: BacklogItem[];
  showArchived: boolean;
  // Item ids that have a live (non-archived) board card linked to them.
  liveCardItemIds?: Set<string>;
  // This company's AI Programs; when non-empty, items can be tagged to one.
  programs?: { id: string; name: string }[];
  // When set (the per-program view), new items and new groups are created
  // tagged to this program instead of company-wide, so they stay visible in
  // the program-filtered roadmap. Absent = existing behavior, untagged.
  defaultProgramId?: string;
}) {
  const { acceptProposedItem, archiveBacklogItem, archiveRoadmapGroup, createBacklogItem, createRoadmapGroup } = actions;
  const { moveRoadmapGroup, restoreBacklogItem, restoreRoadmapGroup, seedTemplateGroups } = actions;
  const { setEdge8Priority, updateBacklogItem, updateRoadmapGroup } = actions;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [addGroup, setAddGroup] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<Draft>({});
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [groupDrafts, setGroupDrafts] = useState<Record<string, GroupDraft>>({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState<GroupDraft>({ step_label: "", title: "", intro: "" });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const proposed = items.filter((i) => i.status === "proposed");
  const activeGroups = groups.filter((g) => !g.archived_at);
  const knownKeys = new Set(groups.map((g) => g.key));
  const orphans = items.filter((i) => !knownKeys.has(i.group_key));

  function groupInput(d: GroupDraft): RoadmapGroupInput {
    return { step_label: d.step_label, title: d.title, intro: d.intro, ai_program_id: defaultProgramId ?? null };
  }

  const programName = new Map(programs.map((p) => [p.id, p.name]));

  function renderItem(it: BacklogItem) {
    const isEditing = editing === it.id;
    const d = drafts[it.id] ?? itemToDraft(it);
    const setD = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [it.id]: { ...d, ...patch } }));
    const tok = tokenLabel(it.token_low, it.token_high);

    return (
      <div key={it.id} className={`admin-backlog-editor-item${it.archived_at ? " archived" : ""}`}>
        <div className="admin-backlog-editor-item-top">
          {it.ref && <span className="admin-backlog-editor-ref">{it.ref}</span>}
          <span className="admin-backlog-editor-title">{it.title}</span>
          <span className="admin-backlog-editor-pills">
            {BACKLOG_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`admin-backlog-editor-pill${it.edge8_priority === p ? ` on-${p}` : ""}`}
                disabled={pending}
                onClick={() => run(() => setEdge8Priority(it.id, p))}
                title="Edge8 proposed priority"
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </span>
        </div>

        <div className="admin-backlog-editor-body">
          {it.who && <div><span className="k">Assigned to: </span>{it.who}</div>}
          {it.today_state && <div><span className="k">Today: </span>{it.today_state}</div>}
          {it.build_desc && <div><span className="k">Build: </span>{it.build_desc}</div>}
          <div className="admin-backlog-editor-chips">
            {(it.needs ?? []).map((n) => <span key={n} className="admin-backlog-editor-chip">{n}</span>)}
            {it.ai_program_id && programName.has(it.ai_program_id) && (
              <span className="admin-backlog-editor-chip tok">{programName.get(it.ai_program_id)}</span>
            )}
            {liveCardItemIds?.has(it.id) && <span className="admin-backlog-editor-chip tok">on a board</span>}
            {tok && <span className="admin-backlog-editor-chip tok">est. {tok} Human Tokens</span>}
            {it.source === "client" && <span className="admin-backlog-editor-chip client">client proposed</span>}
            {it.status !== "accepted" && it.source === "edge8" && <span className="admin-backlog-editor-chip">{it.status}</span>}
            {it.client_priority && (
              <span className="admin-backlog-editor-chip client">client set: {PRIORITY_LABEL[it.client_priority]}</span>
            )}
            {it.client_note && <span className="admin-backlog-editor-chip client">note: {it.client_note}</span>}
          </div>
        </div>

        {isEditing && (
          <div className="admin-backlog-editor-form">
            <div className="full">
              <label>Title</label>
              <input value={d.title ?? ""} onChange={(e) => setD({ title: e.target.value })} />
            </div>
            <div>
              <label>Group</label>
              <select value={d.group_key} onChange={(e) => setD({ group_key: e.target.value })}>
                {activeGroups.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select value={d.status} onChange={(e) => setD({ status: e.target.value as BacklogItem["status"] })}>
                {BACKLOG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {programs.length > 0 && (
              <div>
                <label>AI Program</label>
                <select
                  value={d.ai_program_id ?? ""}
                  onChange={(e) => setD({ ai_program_id: e.target.value || null })}
                >
                  <option value="">Company-wide</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label>Assigned to</label>
              <AssigneeSelect value={d.who ?? ""} assignees={assignees} onChange={(who) => setD({ who })} />
            </div>
            <div>
              <label>Needs (comma separated)</label>
              <input value={d.needsCsv ?? ""} onChange={(e) => setD({ needsCsv: e.target.value })} />
            </div>
            <div>
              <label>Human Tokens (low)</label>
              <input type="number" value={d.token_low ?? ""} onChange={(e) => setD({ token_low: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <label>Human Tokens (high)</label>
              <input type="number" value={d.token_high ?? ""} onChange={(e) => setD({ token_high: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div className="full">
              <label>Today (current state)</label>
              <textarea value={d.today_state ?? ""} onChange={(e) => setD({ today_state: e.target.value })} />
            </div>
            <div className="full">
              <label>Build (what we&apos;d build)</label>
              <textarea value={d.build_desc ?? ""} onChange={(e) => setD({ build_desc: e.target.value })} />
            </div>
          </div>
        )}

        <div className="admin-backlog-editor-actions">
          {it.status === "proposed" && (
            <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => acceptProposedItem(it.id))}>
              Accept into plan
            </button>
          )}
          {isEditing ? (
            <>
              <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => updateBacklogItem(it.id, draftToInput(d)), () => setEditing(null))}>
                Save
              </button>
              <button type="button" className="admin-backlog-editor-link" onClick={() => setEditing(null)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="admin-backlog-editor-link" onClick={() => { setDrafts((p) => ({ ...p, [it.id]: itemToDraft(it) })); setEditing(it.id); }}>
              Edit
            </button>
          )}
          {it.archived_at ? (
            <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => restoreBacklogItem(it.id))}>Restore</button>
          ) : (
            <button type="button" className="admin-backlog-editor-link danger" disabled={pending} onClick={() => run(() => archiveBacklogItem(it.id))}>Archive</button>
          )}
        </div>
      </div>
    );
  }

  function renderGroupForm(d: GroupDraft, setG: (patch: Partial<GroupDraft>) => void) {
    return (
      <div className="admin-backlog-editor-form">
        <div className="full">
          <label>Title</label>
          <input autoFocus value={d.title} onChange={(e) => setG({ title: e.target.value })} placeholder="e.g. Chatbot on payrolliq" />
        </div>
        <div>
          <label>Milestone label (optional chip, e.g. Milestone 1, Anytime)</label>
          <input value={d.step_label} onChange={(e) => setG({ step_label: e.target.value })} />
        </div>
        <div className="full">
          <label>Intro (optional line under the title)</label>
          <textarea value={d.intro} onChange={(e) => setG({ intro: e.target.value })} />
        </div>
      </div>
    );
  }

  function renderGroup(g: RoadmapGroup, index: number) {
    const groupItems = items.filter((i) => i.group_key === g.key);
    const isEditingGroup = editingGroup === g.id;
    // Editing forces the group open so the form can't hide behind a collapse.
    const isCollapsed = !!collapsedGroups[g.id] && !isEditingGroup;
    const openCount = groupItems.filter((i) => !i.archived_at).length;
    const gd = groupDrafts[g.id] ?? { step_label: g.step_label ?? "", title: g.title, intro: g.intro ?? "" };
    const setG = (patch: Partial<GroupDraft>) => setGroupDrafts((prev) => ({ ...prev, [g.id]: { ...gd, ...patch } }));
    const toggle = () => setCollapsedGroups((p) => ({ ...p, [g.id]: !p[g.id] }));

    return (
      <div key={g.id} className={`admin-backlog-editor-group${g.archived_at ? " archived" : ""}`}>
        <div className="admin-backlog-editor-group-head" onClick={toggle}>
          <button type="button" className={`admin-backlog-editor-caret${isCollapsed ? " closed" : ""}`} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand milestone" : "Collapse milestone"}>
            ▼
          </button>
          {g.step_label && <span className="admin-backlog-editor-step">{g.step_label}</span>}
          <span className="admin-backlog-editor-group-title">{g.title}</span>
          <span className="admin-backlog-editor-count">{openCount} item{openCount === 1 ? "" : "s"}</span>
          {!g.archived_at ? (
            <span className="admin-backlog-editor-group-tools" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="admin-backlog-editor-link muted" disabled={pending || index === 0} onClick={() => run(() => moveRoadmapGroup(g.id, "up"))} title="Move group up">↑</button>
              <button type="button" className="admin-backlog-editor-link muted" disabled={pending || index === activeGroups.length - 1} onClick={() => run(() => moveRoadmapGroup(g.id, "down"))} title="Move group down">↓</button>
              <button type="button" className="admin-backlog-editor-link muted" onClick={() => { setGroupDrafts((p) => ({ ...p, [g.id]: { step_label: g.step_label ?? "", title: g.title, intro: g.intro ?? "" } })); setEditingGroup(isEditingGroup ? null : g.id); }}>
                {isEditingGroup ? "Close" : "Edit group"}
              </button>
              {groupItems.filter((i) => !i.archived_at).length === 0 && (
                <button type="button" className="admin-backlog-editor-link danger" disabled={pending} onClick={() => run(() => archiveRoadmapGroup(g.id))}>Archive group</button>
              )}
            </span>
          ) : (
            <span className="admin-backlog-editor-group-tools" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => restoreRoadmapGroup(g.id))}>Restore group</button>
            </span>
          )}
        </div>
        {!isCollapsed && (
        <div className="admin-backlog-editor-group-body">
        {g.intro && <div className="admin-backlog-editor-group-intro">{g.intro}</div>}

        {isEditingGroup && (
          <div className="admin-backlog-editor-item">
            {renderGroupForm(gd, setG)}
            <div className="admin-backlog-editor-actions">
              <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => updateRoadmapGroup(g.id, groupInput(gd)), () => setEditingGroup(null))}>
                Save group
              </button>
              <button type="button" className="admin-backlog-editor-link" onClick={() => setEditingGroup(null)}>Cancel</button>
            </div>
          </div>
        )}

        {groupItems.map(renderItem)}

        {!g.archived_at && (addGroup === g.key ? (
          <div className="admin-backlog-editor-item">
            <div className="admin-backlog-editor-form">
              <div className="full">
                <label>Title</label>
                <input autoFocus value={addDraft.title ?? ""} onChange={(e) => setAddDraft({ ...addDraft, title: e.target.value })} />
              </div>
              <div>
                <label>Priority</label>
                <select value={addDraft.edge8_priority ?? "next"} onChange={(e) => setAddDraft({ ...addDraft, edge8_priority: e.target.value as BacklogPriority })}>
                  {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label>Assigned to</label>
                <AssigneeSelect value={addDraft.who ?? ""} assignees={assignees} onChange={(who) => setAddDraft({ ...addDraft, who })} />
              </div>
              <div className="full">
                <label>Build (optional)</label>
                <textarea value={addDraft.build_desc ?? ""} onChange={(e) => setAddDraft({ ...addDraft, build_desc: e.target.value })} />
              </div>
            </div>
            <div className="admin-backlog-editor-actions">
              <button type="button" className="admin-backlog-editor-link" disabled={pending} onClick={() => run(() => createBacklogItem(companyId, { ...draftToInput({ ...addDraft, group_key: g.key }) }), () => { setAddGroup(null); setAddDraft({}); })}>
                Add item
              </button>
              <button type="button" className="admin-backlog-editor-link" onClick={() => { setAddGroup(null); setAddDraft({}); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="admin-backlog-editor-link admin-backlog-editor-add" onClick={() => { setAddGroup(g.key); setAddDraft({ edge8_priority: "next", ai_program_id: defaultProgramId ?? null }); }}>
            + Add item to {g.step_label || g.title}
          </button>
        ))}
        </div>
        )}
      </div>
    );
  }

  const newGroupForm = (
    <div className="admin-backlog-editor-newgroup">
      {renderGroupForm(newGroup, (patch) => setNewGroup((p) => ({ ...p, ...patch })))}
      <div className="admin-backlog-editor-actions">
        <button
          type="button"
          className="admin-backlog-editor-link"
          disabled={pending || !newGroup.title.trim()}
          onClick={() => run(() => createRoadmapGroup(companyId, groupInput(newGroup)), () => { setNewGroupOpen(false); setNewGroup({ step_label: "", title: "", intro: "" }); })}
        >
          Create group
        </button>
        <button type="button" className="admin-backlog-editor-link" onClick={() => setNewGroupOpen(false)}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="admin-backlog-editor">
      {err && <div className="admin-alert admin-alert--err u-mb-3">{err}</div>}

      {proposed.length > 0 && (
        <div className="admin-backlog-editor-proposed">
          <h3>Client proposed {proposed.length} item{proposed.length === 1 ? "" : "s"}: review below</h3>
          <div className="u-amber">
            {proposed.map((p) => p.title).join(" · ")}
          </div>
        </div>
      )}

      {/* Items with no group still render (as Ungrouped below), so the empty
          state only shows when there is truly nothing. */}
      {groups.length === 0 && items.length === 0 ? (
        <div className="admin-backlog-editor-empty">
          <p>
            No roadmap yet. A roadmap is a set of milestones you define for this client:
            start from a blank one, or seed the standard Edge8 5-milestone layout and
            shape it from there.
          </p>
          {newGroupOpen ? (
            newGroupForm
          ) : (
            <div className="row">
              <button type="button" className="admin-backlog-editor-btn" onClick={() => setNewGroupOpen(true)}>Create a group</button>
              <button type="button" className="admin-backlog-editor-btn ghost" disabled={pending} onClick={() => run(() => seedTemplateGroups(companyId))}>
                Start from the Edge8 template
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {activeGroups.map(renderGroup)}
          {showArchived && groups.filter((g) => g.archived_at).map((g) => renderGroup(g, -1))}

          {orphans.length > 0 && (
            <div className="admin-backlog-editor-group neutral">
              <div className="admin-backlog-editor-group-head">
                <span className="admin-backlog-editor-group-title">Ungrouped</span>
              </div>
              <div className="admin-backlog-editor-group-body">
                <div className="admin-backlog-editor-group-intro">
                  These items point at a group that no longer exists here. Edit each one to move it into a current group.
                </div>
                {orphans.map(renderItem)}
              </div>
            </div>
          )}

          {newGroupOpen ? (
            newGroupForm
          ) : (
            <button type="button" className="admin-backlog-editor-link" onClick={() => setNewGroupOpen(true)}>+ Add a group</button>
          )}
        </>
      )}
    </div>
  );
}
