"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Icon } from "@/kernel/ui/Icon";
import {
  BACKLOG_PRIORITIES,
  PRIORITY_LABEL,
  effectivePriority,
  tokenLabel,
  type BacklogItem,
  type BacklogPriority,
  type RoadmapGroup,
} from "@/entities/client-programs/client";
import { setMyPriority, proposeMyItem, reorderMyGroup } from "./actions";
import { ProposeAssist } from "./ProposeAssist";

// Rebuild the flat item list from a single group's reordered array, preserving
// every other group's order and the overall group sequence.
function rebuild(
  all: BacklogItem[],
  groups: RoadmapGroup[],
  group: string,
  reordered: BacklogItem[],
): BacklogItem[] {
  return groups.flatMap((g) =>
    g.key === group ? reordered : all.filter((i) => i.group_key === g.key),
  );
}

export function BacklogPortalView({
  items,
  groups,
  companyId,
  canPrioritize,
  canPropose,
  programId,
}: {
  items: BacklogItem[];
  groups: RoadmapGroup[];
  companyId: string;
  // Role gates (PR 2): admins reorder + set priorities; contributors propose;
  // viewers read. The server actions re-check, this only shapes the UI.
  canPrioritize: boolean;
  canPropose: boolean;
  // Set on a program page's roadmap tab: proposals made here carry the
  // program's tag. The hub's company-wide roadmap omits it.
  programId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [proposeGroup, setProposeGroup] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState("");
  const [pNote, setPNote] = useState("");
  const [pPriority, setPPriority] = useState<BacklogPriority>("next");
  const [pHint, setPHint] = useState<string | null>(null);

  // Local copy so drag + priority edits feel instant; re-sync after a refresh.
  const [ordered, setOrdered] = useState<BacklogItem[]>(items);
  useEffect(() => setOrdered(items), [items]);

  const counts = useMemo(() => {
    const c: Record<BacklogPriority, number> = { now: 0, next: 0, later: 0, park: 0 };
    for (const it of ordered) c[effectivePriority(it)] += 1;
    return c;
  }, [ordered]);

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

  function onDragEnd(result: DropResult) {
    if (!canPrioritize) return;
    const { source, destination } = result;
    if (!destination || destination.droppableId !== source.droppableId) return;
    if (destination.index === source.index) return;
    const group = source.droppableId;
    const arr = ordered.filter((i) => i.group_key === group);
    const [moved] = arr.splice(source.index, 1);
    arr.splice(destination.index, 0, moved);
    const next = rebuild(ordered, groups, group, arr);
    setOrdered(next); // optimistic
    const ids = arr.map((i) => i.id);
    setErr(null);
    start(async () => {
      const r = await reorderMyGroup(group, ids);
      if (!r.ok) {
        setErr(r.error ?? "Couldn't save the new order.");
        setOrdered(items); // roll back to server truth
      } else {
        router.refresh();
      }
    });
  }

  function renderItem(it: BacklogItem, index: number) {
    const eff = effectivePriority(it);
    const tok = tokenLabel(it.token_low, it.token_high);
    return (
      <Draggable draggableId={it.id} index={index} key={it.id} isDragDisabled={!canPrioritize}>
        {(provided, snapshot) => (
          <div
            className={`admin-backlog-item${snapshot.isDragging ? " dragging" : ""}`}
            ref={provided.innerRef}
            {...provided.draggableProps}
          >
            <span
              className="admin-backlog-handle"
              {...provided.dragHandleProps}
              title={canPrioritize ? "Drag to reorder" : undefined}
              aria-label={canPrioritize ? "Drag to reorder" : undefined}
              style={canPrioritize ? undefined : { visibility: "hidden" }}
            >
              <Icon name="grip" />
            </span>
            <div className="admin-backlog-main">
              <div className="admin-backlog-item-top">
                {it.ref && <span className="admin-backlog-ref">{it.ref}</span>}
                <span className="admin-backlog-title">{it.title}</span>
                <span className="admin-backlog-pills">
                  {canPrioritize ? (
                    BACKLOG_PRIORITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`admin-backlog-pill${eff === p ? ` on-${p}` : ""}`}
                        disabled={pending}
                        onClick={() => run(() => setMyPriority(it.id, it.client_priority === p ? null : p))}
                        title={it.client_priority ? "Your priority" : "Edge8 proposed, click to set yours"}
                      >
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))
                  ) : (
                    // A viewer sees one pill instead of the four, so it carries the effective
                    // priority's own colour for the same reason the editable row highlights it.
                    <span className={`admin-backlog-pill on-${eff} u-cursor-default`}>{PRIORITY_LABEL[eff]}</span>
                  )}
                </span>
              </div>
              <div className="admin-backlog-body">
                {it.who && <div><span className="k">Assigned to: </span>{it.who}</div>}
                {it.today_state && <div><span className="k">Today: </span>{it.today_state}</div>}
                {it.build_desc && <div><span className="k">What we&apos;d build: </span>{it.build_desc}</div>}
                <div className="admin-backlog-chips">
                  {(it.needs ?? []).map((n) => <span key={n} className="admin-backlog-chip">{n}</span>)}
                  {tok && <span className="admin-backlog-chip tok">est. {tok} Human Tokens</span>}
                  {it.source === "client" && (
                    <span className="admin-backlog-chip proposed">{it.status === "proposed" ? "your proposal, awaiting Edge8" : "your idea"}</span>
                  )}
                  {it.client_priority && it.client_priority !== it.edge8_priority && (
                    <span className="admin-backlog-chip mine">you changed from Edge8&apos;s {PRIORITY_LABEL[it.edge8_priority]}</span>
                  )}
                </div>
                {canPrioritize && it.client_priority && (
                  <div className="admin-backlog-hint">
                    You set this. Click the highlighted pill again to revert to Edge8&apos;s suggestion ({PRIORITY_LABEL[it.edge8_priority]}).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Draggable>
    );
  }

  return (
    <div className="admin-backlog">
      <p className="admin-backlog-intro">
        Your roadmap, section by section, as agreed with Edge8.{" "}
        {canPrioritize && (
          <>Set your priority on any item, drag the handle to reorder within a section, and use{" "}
          <em>Propose an item</em> to add your own (it comes to us to review).{" "}</>
        )}
        {!canPrioritize && canPropose && (
          <>Use <em>Propose an item</em> to add your own (it comes to us to review); your account
          admin controls priorities.{" "}</>
        )}
        Human Token estimates are pre-research ranges (1 Human Token = 1 hour of Edge8 expert time).
      </p>

      <div className="admin-backlog-counts">
        {BACKLOG_PRIORITIES.map((p) => (
          <span key={p} className="admin-backlog-count">{PRIORITY_LABEL[p]}: {counts[p]}</span>
        ))}
      </div>

      {err && <div className="admin-backlog-err">{err}</div>}

      <DragDropContext onDragEnd={onDragEnd}>
        {groups.map((g) => {
          const groupItems = ordered.filter((i) => i.group_key === g.key);
          return (
            <div key={g.key} className="admin-backlog-group">
              <div className="admin-backlog-group-head">
                {g.step_label && <span className="admin-backlog-step">{g.step_label}</span>}
                <span className="admin-backlog-group-title">{g.title}</span>
              </div>
              {g.intro && <div className="admin-backlog-group-intro">{g.intro}</div>}

              <Droppable droppableId={g.key}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {groupItems.map((it, i) => renderItem(it, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {companyId && canPropose && (proposeGroup === g.key ? (
                <div className="admin-backlog-propose">
                  <ProposeAssist
                    onDraft={(d) => {
                      setPTitle(d.title);
                      setPNote(d.note);
                      setPPriority((BACKLOG_PRIORITIES as readonly string[]).includes(d.priority) ? (d.priority as BacklogPriority) : "next");
                      const suggested = groups.find((x) => x.key === d.groupKey);
                      setPHint(
                        d.groupKey !== g.key
                          ? `Tip: this might fit better under ${suggested?.title ?? d.groupKey}. You can propose it there instead, or send it here and Edge8 will place it.`
                          : null,
                      );
                    }}
                  />
                  <input placeholder="Short title for your idea" value={pTitle} onChange={(e) => setPTitle(e.target.value)} autoFocus />
                  <textarea placeholder="Optional: a sentence on what you're after" value={pNote} onChange={(e) => setPNote(e.target.value)} />
                  <select value={pPriority} onChange={(e) => setPPriority(e.target.value as BacklogPriority)}>
                    {BACKLOG_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                  </select>
                  {pHint && <div className="admin-backlog-hint u-mb-2">{pHint}</div>}
                  <div className="u-row">
                    <button
                      type="button"
                      className="admin-backlog-btn"
                      disabled={pending || !pTitle.trim()}
                      onClick={() => run(
                        () => proposeMyItem({ companyId, groupKey: g.key, title: pTitle, note: pNote, priority: pPriority, aiProgramId: programId }),
                        () => { setProposeGroup(null); setPTitle(""); setPNote(""); setPPriority("next"); setPHint(null); },
                      )}
                    >
                      Send to Edge8
                    </button>
                    <button type="button" className="admin-backlog-btn ghost" onClick={() => { setProposeGroup(null); setPTitle(""); setPNote(""); setPHint(null); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="admin-backlog-link u-mt-2" onClick={() => setProposeGroup(g.key)}>
                  + Propose an item for {g.step_label || g.title}
                </button>
              ))}
            </div>
          );
        })}
      </DragDropContext>
    </div>
  );
}
