"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InlineSaveResult } from "@/kernel/ui/InlineEdit";
import { archiveApplication, getApplicationExtras, getApplicationStages, unarchiveApplication, type ApplicationExtras, type StageOption } from "../actions";
import { updateApplication } from "@/entities/hiring/lib/application-actions";
import { type AppManageData, ok } from "./shared";

// The decision header's state and handlers for one application: the ordered
// hiring stages and the large extras columns (both loaded on mount), the
// header-owned fields (stage, status, rating, rejection reason, archived) with
// their optimistic updates, and the next-stage rule for Advance. The rail owns
// its own fields independently and never collides with these. Split out of
// ApplicationManage (Q3) so the component is the layout and this is the model.
export function useApplicationHead(app: AppManageData, archived: boolean) {
  const router = useRouter();

  const [stages, setStages] = useState<StageOption[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [extras, setExtras] = useState<ApplicationExtras | null>(null);

  // Header-owned state (things the header shows and acts on). The rail owns its
  // own fields independently and never collides with these.
  const [stageId, setStageId] = useState(app.currentStageId ?? "");
  const [status, setStatus] = useState(app.status ?? "active");
  const [rating, setRating] = useState<number | null>(app.rating);
  const [rejectionReason, setRejectionReason] = useState(app.rejectionReason ?? "");
  const [isArchived, setIsArchived] = useState(archived);
  const [headErr, setHeadErr] = useState<string | null>(null);

  // Load this req's ordered hiring stages (drives the strip + Advance).
  useEffect(() => {
    if (!app.jobReqId) {
      setStagesLoading(false);
      return;
    }
    let live = true;
    setStagesLoading(true);
    getApplicationStages(app.jobReqId).then((r) => {
      if (!live) return;
      if (r.ok) setStages(r.stages);
      setStagesLoading(false);
    });
    return () => {
      live = false;
    };
  }, [app.jobReqId]);

  // Cover letter, answers, and the AI screen are large columns kept out of the
  // list payload; load them once the page mounts.
  useEffect(() => {
    let live = true;
    setExtras(null);
    getApplicationExtras(app.id).then((r) => {
      if (!live) return;
      if (r.ok) setExtras(r.extras);
    });
    return () => {
      live = false;
    };
  }, [app.id]);

  const currentIdx = stageId ? stages.findIndex((s) => s.id === stageId) : -1;
  // Next stage for the Advance button. Genuinely unstaged -> the first stage.
  // A stage set but missing from the loaded list (reconfigured on the req) -> no
  // safe advance, rather than silently moving the candidate back to stage one.
  const nextStage: StageOption | null = !stages.length
    ? null
    : !stageId
      ? stages[0] ?? null
      : currentIdx < 0
        ? null
        : (stages[currentIdx + 1] ?? null);

  async function moveToStage(next: StageOption) {
    const prev = stageId;
    setStageId(next.id);
    setHeadErr(null);
    const r = await updateApplication(app.id, { current_stage_id: next.id });
    if (!r.ok) {
      setStageId(prev);
      setHeadErr(r.error);
      return;
    }
    // A terminal stage auto-stamps decided_at server-side; refresh so the strip,
    // the rail's Decided field, and the pipeline all reflect the move.
    router.refresh();
  }

  async function saveRating(v: number | null) {
    const prev = rating;
    setRating(v);
    setHeadErr(null);
    const r = await updateApplication(app.id, { rating: v });
    if (!r.ok) {
      setRating(prev);
      setHeadErr(r.error);
    }
  }

  async function saveStatus(next: string) {
    const prev = status;
    setStatus(next);
    setHeadErr(null);
    const r = await updateApplication(app.id, { status: next });
    if (!r.ok) {
      setStatus(prev);
      setHeadErr(r.error);
    }
  }

  async function doReject(reason: string): Promise<boolean> {
    const prevStatus = status;
    const prevReason = rejectionReason;
    setStatus("rejected");
    setRejectionReason(reason.trim());
    setHeadErr(null);
    const r = await updateApplication(app.id, {
      status: "rejected",
      rejection_reason: reason.trim() || null,
    });
    if (!r.ok) {
      setStatus(prevStatus);
      setRejectionReason(prevReason);
      setHeadErr(r.error);
      return false;
    }
    return true;
  }

  async function saveRejectionReason(v: string): Promise<InlineSaveResult> {
    const r = await updateApplication(app.id, { rejection_reason: v.trim() || null });
    if (r.ok) setRejectionReason(v.trim());
    return r.ok ? ok() : r;
  }

  async function toggleArchive() {
    setHeadErr(null);
    if (isArchived) {
      const r = await unarchiveApplication(app.id);
      if (!r.ok) return setHeadErr(r.error);
      setIsArchived(false);
      router.refresh();
    } else {
      const r = await archiveApplication(app.id);
      if (!r.ok) return setHeadErr(r.error);
      // Archiving drops it from the pipeline; send the recruiter back to the list.
      router.push("/admin/talent/applications");
    }
  }

  return {
    stages,
    stagesLoading,
    extras,
    stageId,
    status,
    rating,
    rejectionReason,
    isArchived,
    headErr,
    nextStage,
    moveToStage,
    saveRating,
    saveStatus,
    doReject,
    saveRejectionReason,
    toggleArchive,
  };
}
