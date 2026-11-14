import { askRequisition, askShortlist, withdrawAsk } from "./ask";
import { draftShadowMessage } from "./application";
import { closeApplicationRun } from "./close-run";
import { proposeShortlist, type ShortlistItem } from "./proposal";
import { AUTO_SHORTLIST_AT, type RequisitionStep } from "./steps";
import { TemplateRefused } from "./templates";
import { isFinalStatus, type ChainApplication, type ChainDeps, type ChainRequisition, type Shortlist, type StepOutcome } from "./types";
import { requisitionVersion, shortlistVersion } from "./versions";

// The requisition machine (spec section 3a): asking to open a draft
// requisition, opening it once approved, proposing a shortlist of the
// screened applications, and applying the approved lanes. As in the
// application machine, every write is fenced on the step it read.
//
// Shadow (Z.17): the shortlist runs in shadow. It writes the round it would
// have proposed with mode = shadow, and the invitation and decline it would
// have drafted for each advance and decline, and asks for nothing, moves
// nobody and goes back to collecting. Asking to open, opening and applying a
// shortlist refuse in shadow.

const HELD = "The hiring chain is in shadow: this step asks, opens or moves applications, so it waits until the chain is live.";

const ok = (req: ChainRequisition, step: string, next: string | null, summary: string): StepOutcome => ({ ok: true, id: req.id, step, next, summary });
const fail = (id: string, step: string, error: string): StepOutcome => ({ ok: false, id, step, error });

export async function advanceRequisition(id: string, deps: ChainDeps, opts: { requestedBy?: string | null } = {}): Promise<StepOutcome> {
  const req = await deps.store.requisition(id);
  if (!req) return { skipped: "No such requisition.", id };
  if (req.error) return { skipped: "The run is stopped; Retry starts it again.", id };
  const step = req.step;
  try {
    switch (step) {
      case "ask-open":
        return await askOpenStep(req, deps, opts.requestedBy ?? null);
      case "open":
        return await openStep(req, deps);
      case "collecting":
      case "shortlist":
        return await shortlistStep(req, step, deps);
      case "apply-shortlist":
        return await applyShortlistStep(req, deps);
      default:
        return { skipped: `The requisition waits at ${step ?? "no step"}.`, id };
    }
  } catch (err) {
    return fail(id, step ?? "-", err instanceof Error ? err.message : String(err));
  }
}

function refuseInShadow(deps: ChainDeps): void {
  if (deps.mode() === "shadow") throw new Error(HELD);
}

// ── open ───────────────────────────────────────────────────────────────────
async function askOpenStep(req: ChainRequisition, deps: ChainDeps, requestedBy: string | null): Promise<StepOutcome> {
  refuseInShadow(deps);
  if (req.status !== "draft") {
    const next: RequisitionStep | null = req.status === "open" ? "collecting" : null;
    await deps.store.setRequisition(req.id, { step: next }, { step: "ask-open" });
    return ok(req, "ask-open", next, `The requisition is ${req.status}, not a draft; nothing to ask.`);
  }
  const asked = await askRequisition(deps, req, requestedBy);
  if (!asked.ok) return fail(req.id, "ask-open", asked.error);
  await deps.store.setRequisition(req.id, { step: "open-ready" }, { step: "ask-open" });
  return ok(req, "ask-open", "open-ready", "Opening the requisition waits on its approval.");
}

async function openStep(req: ChainRequisition, deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  const approval = await deps.approvals.latest("hiring_requisition", req.id);
  const version = requisitionVersion(req.content);
  if (approval?.state !== "approved") {
    await deps.store.setRequisition(req.id, { step: null }, { step: "open" });
    return ok(req, "open", null, `Not opened: the approval is ${approval?.state ?? "missing"}.`);
  }
  if (approval.metadata.version !== version) {
    // Edited after the approval: ask again for the requisition as it is now.
    const asked = await askRequisition(deps, req, approval.requestedBy);
    if (!asked.ok) return fail(req.id, "open", asked.error);
    await deps.store.setRequisition(req.id, { step: "open-ready" }, { step: "open" });
    return ok(req, "open", "open-ready", "The requisition changed after its approval; it was asked again and not opened.");
  }
  const opened = await deps.store.openRequisition(req.id);
  await deps.store.setRequisition(req.id, { step: "collecting" }, { step: "open" });
  return ok(req, "open", "collecting", opened ? "Opened; collecting applications." : "Already open; collecting applications.");
}

// ── shortlist ──────────────────────────────────────────────────────────────

/** The applications at triage that no shortlist of this mode has proposed yet. */
export function untriaged(apps: ChainApplication[], shortlists: Shortlist[], mode: "live" | "shadow"): ChainApplication[] {
  const proposed = new Set(shortlists.filter((s) => s.mode === mode).flatMap((s) => s.items.map((i) => i.application_id)));
  return apps.filter((a) => !proposed.has(a.id));
}

/** Whether a requisition at collecting proposes on its own: enough screened applications wait that no round has covered. */
export function autoShortlistDue(apps: ChainApplication[], shortlists: Shortlist[], mode: "live" | "shadow"): boolean {
  return untriaged(apps, shortlists, mode).length >= AUTO_SHORTLIST_AT;
}

async function shortlistStep(req: ChainRequisition, step: "collecting" | "shortlist", deps: ChainDeps): Promise<StepOutcome> {
  const mode = deps.mode();
  const [apps, rounds] = await Promise.all([deps.store.triageApplications(req.id), deps.store.shortlists(req.id)]);
  // From collecting the driver proposes only once enough new applications
  // wait; a person's Propose shortlist asks about every one at triage.
  // A shortlist step that proposes no round must not close its tick: the tick
  // is the round number, so a later round would find it taken for good
  // (review finding 2). It answers "skipped", which leaves the tick free.
  if (step === "collecting" && !autoShortlistDue(apps, rounds, mode)) {
    return { skipped: "Not enough new screened applications for a shortlist yet.", id: req.id };
  }
  if (apps.length === 0) {
    await deps.store.setRequisition(req.id, { step: "collecting" }, { step });
    return { skipped: "No screened application waits at triage.", id: req.id };
  }
  const items = proposeShortlist(
    apps.map((a) => ({ id: a.id, aiRating: a.aiRating, aiScreenStatus: a.aiScreenStatus, flags: a.flags })),
  );
  const ofMode = rounds.filter((s) => s.mode === mode);
  if (mode === "live") {
    const waiting = ofMode.find((s) => s.status === "proposed");
    const shortlist = waiting ?? (await insertRound(req, ofMode, items, "live", deps));
    const asked = await askShortlist(deps, req, shortlist);
    if (!asked.ok) return fail(req.id, step, asked.error);
    await deps.store.setRequisition(req.id, { step: "shortlist-ready" }, { step });
    return ok(req, step, "shortlist-ready", `Round ${shortlist.round}: ${laneCounts(shortlist.items)}. It waits on its approval.`);
  }

  // Shadow: the round it would have proposed, and the messages it would have drafted.
  const shortlist = await insertRound(req, ofMode, items, "shadow", deps);
  let drafted = 0;
  let notDrafted: string | null = null;
  for (const item of shortlist.items) {
    if (item.lane === "hold") continue;
    const app = apps.find((a) => a.id === item.application_id);
    if (!app) continue;
    try {
      const stage = item.lane === "advance" ? await deps.store.firstInterviewStage(req.id) : null;
      await draftShadowMessage(app, item.lane === "advance" ? "invite" : "decline", stage?.id ?? null, deps, `${req.epoch ?? "-"}:shortlist:${shortlist.round}`);
      drafted++;
    } catch (err) {
      // A draft that cannot be written (no email, no organisation name) is
      // itself what shadow is for: the round still records the lanes.
      notDrafted = err instanceof TemplateRefused ? err.message : err instanceof Error ? err.message : String(err);
    }
  }
  await deps.store.setRequisition(req.id, { step: "collecting" }, { step });
  return ok(
    req,
    step,
    "collecting",
    `Shadow round ${shortlist.round}: ${laneCounts(shortlist.items)}; ${drafted} message${drafted === 1 ? "" : "s"} drafted and none sent.${notDrafted ? ` Not drafted: ${notDrafted}` : ""}`,
  );
}

function laneCounts(items: ShortlistItem[]): string {
  const n = (lane: string) => items.filter((i) => i.lane === lane).length;
  return `${n("advance")} to advance, ${n("decline")} to decline, ${n("hold")} held`;
}

async function insertRound(req: ChainRequisition, ofMode: Shortlist[], items: ShortlistItem[], mode: "live" | "shadow", deps: ChainDeps): Promise<Shortlist> {
  const round = ofMode.reduce((m, s) => Math.max(m, s.round), 0) + 1;
  return deps.store.insertShortlist({
    requisitionId: req.id,
    round,
    mode,
    status: "proposed",
    items,
    version: shortlistVersion(round, items),
  });
}

// ── apply the approved shortlist ───────────────────────────────────────────
async function applyShortlistStep(req: ChainRequisition, deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  const approved = (await deps.store.shortlists(req.id)).filter((s) => s.mode === "live" && s.status === "approved").sort((a, b) => b.round - a.round)[0];
  if (!approved) {
    await deps.store.setRequisition(req.id, { step: "collecting" }, { step: "apply-shortlist" });
    return ok(req, "apply-shortlist", "collecting", "No approved shortlist to apply.");
  }
  const approval = await deps.approvals.latest("hiring_shortlist", approved.id);
  const version = shortlistVersion(approved.round, approved.items);
  if (approval?.state !== "approved" || approval.metadata.version !== version || approved.version !== version) {
    await deps.store.updateShortlist(approved.id, { status: "proposed", version }, { status: ["approved"] });
    const fresh = (await deps.store.shortlist(approved.id)) ?? { ...approved, version };
    await withdrawAsk(deps, "hiring_shortlist", approved.id, { id: req.id, epoch: req.epoch, what: `shortlist-${approved.id}` }, null, "The lanes changed after the approval.");
    const asked = await askShortlist(deps, req, fresh);
    if (!asked.ok) return fail(req.id, "apply-shortlist", asked.error);
    await deps.store.setRequisition(req.id, { step: "shortlist-ready" }, { step: "apply-shortlist" });
    return ok(req, "apply-shortlist", "shortlist-ready", "The lanes differ from the approved version; asked again and nothing moved.");
  }

  const stage = await deps.store.firstInterviewStage(req.id);
  let advanced = 0;
  let declined = 0;
  for (const item of approved.items) {
    if (item.lane === "hold") continue;
    const app = await deps.store.application(item.application_id);
    // Fenced at triage: an application moved by hand meanwhile, or already
    // moved by an earlier attempt at this step, is left as it is.
    if (!app || app.archived || app.step !== "triage") continue;
    // Decided by hand since the round was proposed (review finding 1): out of the chain, nothing drafted.
    if (isFinalStatus(app.status)) {
      await closeApplicationRun(deps, app, null, `A person set this application to ${app.status} before the shortlist was applied.`);
      continue;
    }
    if (item.lane === "advance") {
      if (stage && app.currentStageId !== stage.id) await deps.store.moveToStage(app.id, app.currentStageId, stage.id);
      if (await deps.store.setApplication(app.id, { step: "draft-invite" }, { step: "triage" })) advanced++;
    } else if (await deps.store.setApplication(app.id, { step: "draft-decline" }, { step: "triage" })) {
      declined++;
    }
  }
  await deps.store.updateShortlist(approved.id, { status: "applied", decidedAt: deps.now().toISOString() }, { status: ["approved"] });
  await deps.store.setRequisition(req.id, { step: "collecting" }, { step: "apply-shortlist" });
  return ok(req, "apply-shortlist", "collecting", `Applied round ${approved.round}: ${advanced} invitation${advanced === 1 ? "" : "s"} and ${declined} decline${declined === 1 ? "" : "s"} to draft; held applications stay at triage.`);
}
