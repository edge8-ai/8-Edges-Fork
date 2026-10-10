import { mustRows } from "@/kernel/data/read";
import { companyOs, type CompanyOsUpdate, type Json } from "@/kernel/data/supabase";
import { GREETING_COLUMNS, greetingName, NAME_ONLY_COLUMNS, personName, type GreetedPerson, type NamedPerson } from "@/kernel/config/people-name";
import { logStageMove } from "@/entities/hiring/lib/ats/stage-log";
import { FINAL_STATUSES, type ApplicationPatch, type ChainStore, type MessageContext, type MessagePatch, type NewMessage, type RequisitionPatch } from "./types";
import {
  APP_COLUMNS,
  MSG_COLUMNS,
  REQ_COLUMNS,
  SHORT_COLUMNS,
  toApp,
  toMsg,
  toReq,
  toShortlist,
  type AppRow,
  type MsgRow,
  type ReqRow,
  type ShortRow,
} from "./store-rows";

// The hiring chain's data on company_os (Z.9). Every read that decides what a
// step does raises on failure (CLAUDE.md rule 2): a failed read must fail the
// step, which the driver retries, never let it act on "no rows". Every write
// that moves a run is fenced on the state the step read and answers whether it
// landed, so a second runner of the same step finds the fence closed.

const UNIQUE_VIOLATION = "23505";

function fail(what: string, message: string): never {
  throw new Error(`${what}: ${message}`);
}

async function one<T>(res: { data: T[] | null; error: { message: string } | null }, what: string): Promise<T | null> {
  const rows = mustRows(res, what);
  return (rows[0] as T | undefined) ?? null;
}

export const supabaseChainStore: ChainStore = {
  async application(id) {
    const row = await one(await companyOs.from("applications").select(APP_COLUMNS).eq("id", id).limit(1), "[hiring/chain] applications");
    return row ? toApp(row as unknown as AppRow) : null;
  },

  async setApplication(id, patch: ApplicationPatch, fence) {
    const update: CompanyOsUpdate<"applications"> = { updated_at: new Date().toISOString() };
    if (patch.step !== undefined) update.chain_step = patch.step;
    if (patch.epoch !== undefined) update.chain_started_at = patch.epoch;
    if (patch.error !== undefined) update.chain_error = patch.error;
    if (patch.proposal !== undefined) update.chain_proposal = patch.proposal as unknown as Json;
    if (patch.flags !== undefined) update.ai_screen_flags = patch.flags as unknown as Json;
    let q = companyOs.from("applications").update(update).eq("id", id);
    if (fence) q = fence.step === null ? q.is("chain_step", null) : q.eq("chain_step", fence.step);
    const { data, error } = await q.select("id");
    if (error) fail("[hiring/chain] applications update", error.message);
    return (data ?? []).length > 0;
  },

  async requisition(id) {
    const row = await one(await companyOs.from("job_requisitions").select(REQ_COLUMNS).eq("id", id).limit(1), "[hiring/chain] job_requisitions");
    return row ? toReq(row as unknown as ReqRow) : null;
  },

  async setRequisition(id, patch: RequisitionPatch, fence) {
    const update: CompanyOsUpdate<"job_requisitions"> = { updated_at: new Date().toISOString() };
    if (patch.step !== undefined) update.chain_step = patch.step;
    if (patch.epoch !== undefined) update.chain_started_at = patch.epoch;
    if (patch.error !== undefined) update.chain_error = patch.error;
    let q = companyOs.from("job_requisitions").update(update).eq("id", id);
    if (fence) q = fence.step === null ? q.is("chain_step", null) : q.eq("chain_step", fence.step);
    const { data, error } = await q.select("id");
    if (error) fail("[hiring/chain] job_requisitions update", error.message);
    return (data ?? []).length > 0;
  },

  async openRequisition(id) {
    const { data, error } = await companyOs
      .from("job_requisitions")
      .update({ status: "open", opened_at: new Date().toISOString(), closed_at: null })
      .eq("id", id)
      .eq("status", "draft")
      .select("id");
    if (error) fail("[hiring/chain] job_requisitions open", error.message);
    return (data ?? []).length > 0;
  },

  async triageApplications(requisitionId) {
    const rows = mustRows(
      await companyOs
        .from("applications")
        .select(APP_COLUMNS)
        .eq("job_requisition_id", requisitionId)
        .eq("chain_step", "triage")
        .is("archived_at", null)
        .in("ai_screen_status", ["done", "failed"])
        // A candidate a person already hired, rejected or saw withdraw is never shortlisted.
        .not("status", "in", `(${FINAL_STATUSES.join(",")})`)
        .order("created_at"),
      "[hiring/chain] triage applications",
    );
    return (rows as unknown as AppRow[]).map(toApp);
  },

  async chainApplications(requisitionId) {
    const rows = mustRows(
      await companyOs
        .from("applications")
        .select(APP_COLUMNS)
        .eq("job_requisition_id", requisitionId)
        .not("chain_step", "is", null)
        .neq("chain_step", "closed")
        .order("created_at"),
      "[hiring/chain] chain applications",
    );
    return (rows as unknown as AppRow[]).map(toApp);
  },

  async shortlists(requisitionId) {
    const rows = mustRows(
      await companyOs.from("hiring_shortlists").select(SHORT_COLUMNS).eq("job_requisition_id", requisitionId).order("round"),
      "[hiring/chain] hiring_shortlists",
    );
    return (rows as ShortRow[]).map(toShortlist);
  },

  async shortlist(id) {
    const row = await one(await companyOs.from("hiring_shortlists").select(SHORT_COLUMNS).eq("id", id).limit(1), "[hiring/chain] hiring_shortlists");
    return row ? toShortlist(row as ShortRow) : null;
  },

  async insertShortlist(s) {
    const { data, error } = await companyOs
      .from("hiring_shortlists")
      .insert({ job_requisition_id: s.requisitionId, round: s.round, mode: s.mode, status: s.status, items: s.items as unknown as Json, version: s.version })
      .select(SHORT_COLUMNS)
      .single();
    if (!error && data) return toShortlist(data as ShortRow);
    if (error?.code !== UNIQUE_VIOLATION) fail("[hiring/chain] hiring_shortlists insert", error?.message ?? "no row");
    // A retried step: the round, or the requisition's one waiting proposal, is already there.
    const existing = await one(
      await companyOs
        .from("hiring_shortlists")
        .select(SHORT_COLUMNS)
        .eq("job_requisition_id", s.requisitionId)
        .eq("mode", s.mode)
        .or(`round.eq.${s.round},status.eq.proposed`)
        .order("round", { ascending: false })
        .limit(1),
      "[hiring/chain] hiring_shortlists existing",
    );
    if (!existing) fail("[hiring/chain] hiring_shortlists insert", "conflict with no row");
    return toShortlist(existing as ShortRow);
  },

  async updateShortlist(id, patch, fence) {
    const update: CompanyOsUpdate<"hiring_shortlists"> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.items !== undefined) update.items = patch.items as unknown as Json;
    if (patch.version !== undefined) update.version = patch.version;
    if (patch.decidedAt !== undefined) update.decided_at = patch.decidedAt;
    let q = companyOs.from("hiring_shortlists").update(update).eq("id", id);
    if (fence) q = q.in("status", fence.status);
    const { data, error } = await q.select("id");
    if (error) fail("[hiring/chain] hiring_shortlists update", error.message);
    return (data ?? []).length > 0;
  },

  async firstInterviewStage(requisitionId) {
    const row = await one(
      await companyOs
        .from("application_stages")
        .select("id, name")
        .eq("job_requisition_id", requisitionId)
        .eq("stage_kind", "interview")
        .order("position")
        .limit(1),
      "[hiring/chain] application_stages",
    );
    return row ? { id: row.id, name: row.name } : null;
  },

  async moveToStage(applicationId, fromStageId, toStageId) {
    const { error } = await companyOs
      .from("applications")
      .update({ current_stage_id: toStageId, decided_at: null, updated_at: new Date().toISOString() })
      .eq("id", applicationId)
      .eq("chain_step", "triage");
    if (error) fail("[hiring/chain] applications stage", error.message);
    await logStageMove(applicationId, fromStageId, toStageId);
  },

  async messageContext(applicationId): Promise<MessageContext> {
    const app = await one(
      await companyOs.from("applications").select("person_id, job_requisition_id").eq("id", applicationId).limit(1),
      "[hiring/chain] applications",
    );
    if (!app) fail("[hiring/chain] message context", "application not found");
    const [personRow, reqRow, loopRow] = await Promise.all([
      app.person_id
        ? one(await companyOs.from("people").select(GREETING_COLUMNS).eq("id", app.person_id).limit(1), "[hiring/chain] people")
        : Promise.resolve(null),
      one(
        await companyOs.from("job_requisitions").select("title, recruiter_id, hiring_manager_id").eq("id", app.job_requisition_id).limit(1),
        "[hiring/chain] job_requisitions",
      ),
      one(
        await companyOs
          .from("requisition_loop_steps")
          .select("name, duration_minutes")
          .eq("job_requisition_id", app.job_requisition_id)
          .order("position")
          .limit(1),
        "[hiring/chain] requisition_loop_steps",
      ),
    ]);
    // The recruiter is a team_members row (job_requisitions.recruiter_id); the
    // hiring manager is a person. Replies go to the recruiter, else the manager.
    let replyPerson: (NamedPerson & { email: string | null }) | null = null;
    if (reqRow?.recruiter_id) {
      const tm = await one(await companyOs.from("team_members").select("person_id").eq("id", reqRow.recruiter_id).limit(1), "[hiring/chain] team_members");
      if (tm?.person_id) {
        replyPerson = await one(await companyOs.from("people").select(`${NAME_ONLY_COLUMNS}, email`).eq("id", tm.person_id).limit(1), "[hiring/chain] recruiter");
      }
    }
    if (!replyPerson && reqRow?.hiring_manager_id) {
      replyPerson = await one(await companyOs.from("people").select(`${NAME_ONLY_COLUMNS}, email`).eq("id", reqRow.hiring_manager_id).limit(1), "[hiring/chain] hiring manager");
    }
    const person = personRow as (GreetedPerson & { email: string | null }) | null;
    return {
      toEmail: person?.email?.trim() || null,
      replyTo: replyPerson?.email?.trim() || null,
      facts: {
        firstName: person ? greetingName(person, null) : null,
        roleTitle: reqRow?.title ?? "the role",
        stepName: loopRow?.name ?? null,
        stepMinutes: loopRow?.duration_minutes ?? null,
        recruiterName: replyPerson ? personName({ ...replyPerson, email: null }, null) : null,
      },
    };
  },

  async message(id) {
    const row = await one(await companyOs.from("candidate_messages").select(MSG_COLUMNS).eq("id", id).limit(1), "[hiring/chain] candidate_messages");
    return row ? toMsg(row as MsgRow) : null;
  },

  async messages(applicationId) {
    const rows = mustRows(
      await companyOs.from("candidate_messages").select(MSG_COLUMNS).eq("application_id", applicationId).order("created_at", { ascending: false }),
      "[hiring/chain] candidate_messages",
    );
    return (rows as MsgRow[]).map(toMsg);
  },

  async activeMessage(key) {
    const row = await one(
      await companyOs
        .from("candidate_messages")
        .select(MSG_COLUMNS)
        .eq("send_key", key)
        .eq("mode", "live")
        .in("status", ["pending", "approved", "sending", "sent"])
        .limit(1),
      "[hiring/chain] candidate_messages active",
    );
    return row ? toMsg(row as MsgRow) : null;
  },

  async insertMessage(m: NewMessage) {
    const { data, error } = await companyOs
      .from("candidate_messages")
      .insert({
        application_id: m.applicationId,
        person_id: m.personId,
        kind: m.kind,
        stage_id: m.stageId,
        mode: m.mode,
        status: m.status,
        to_email: m.toEmail,
        subject: m.subject,
        body_md: m.body,
        drafted_body_md: m.draftedBody,
        version: m.version,
        send_key: m.sendKey,
        run_tick: m.runTick,
      })
      .select(MSG_COLUMNS)
      .single();
    if (!error && data) return toMsg(data as MsgRow);
    if (error?.code === UNIQUE_VIOLATION && m.mode === "live") {
      // A retried draft step: the live draft on this key is already there.
      const existing = await supabaseChainStore.activeMessage(m.sendKey);
      if (existing) return existing;
    }
    fail("[hiring/chain] candidate_messages insert", error?.message ?? "no row");
  },

  async updateMessage(id, patch: MessagePatch, fence) {
    const update: CompanyOsUpdate<"candidate_messages"> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.body !== undefined) update.body_md = patch.body;
    if (patch.version !== undefined) update.version = patch.version;
    if (patch.approvedBy !== undefined) update.approved_by = patch.approvedBy;
    if (patch.approvedAt !== undefined) update.approved_at = patch.approvedAt;
    if (patch.claimedAt !== undefined) update.claimed_at = patch.claimedAt;
    if (patch.sentAt !== undefined) update.sent_at = patch.sentAt;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.providerRef !== undefined) update.provider_ref = patch.providerRef;
    let q = companyOs.from("candidate_messages").update(update).eq("id", id);
    if (fence) q = q.in("status", fence.status);
    if (fence?.version) q = q.eq("version", fence.version);
    const { data, error } = await q.select("id");
    if (error) fail("[hiring/chain] candidate_messages update", error.message);
    return (data ?? []).length > 0;
  },

  async claimMessage(id, staleBefore, expiredBefore) {
    const now = new Date().toISOString();
    const { data, error } = await companyOs
      .from("candidate_messages")
      .update({ status: "sending", claimed_at: now, updated_at: now })
      .eq("id", id)
      .eq("mode", "live")
      // Quoted: an ISO time's colons and dot are reserved inside a PostgREST list.
      .or(`status.eq.approved,and(status.eq.sending,claimed_at.lt."${staleBefore}",claimed_at.gt."${expiredBefore}")`)
      .select("id");
    if (error) fail("[hiring/chain] candidate_messages claim", error.message);
    return (data ?? []).length > 0;
  },

  async decidedByHand() {
    const rows = mustRows(
      await companyOs
        .from("applications")
        .select(APP_COLUMNS)
        .not("chain_step", "is", null)
        .not("chain_step", "in", "(send,decide,closed)")
        .in("status", [...FINAL_STATUSES])
        .limit(200),
      "[hiring/chain] applications decided by hand",
    );
    return (rows as unknown as AppRow[]).map(toApp);
  },
};
