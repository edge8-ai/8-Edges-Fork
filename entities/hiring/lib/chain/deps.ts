import { decidePendingApproval, openApproval, withdrawPendingApproval } from "@/kernel/approvals/requests";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { closeParkedRun, parkRun } from "@/kernel/audit/parked-runs";
import { currentRunMode } from "@/kernel/audit/run-context";
import { ORG_NAME } from "@/kernel/config/organisation";
import { deliverOutbox } from "@/kernel/events";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { cancelScheduledInterviews } from "@/entities/hiring/lib/interviews-writes";
import { precheck } from "@/entities/hiring/lib/resume-precheck";
import { candidateTextsFor } from "@/entities/hiring/lib/resume-precheck-input";
import { screenApplication } from "@/entities/hiring/lib/resume-screen";
import { CHAIN_ROUTINE_ID, HIRING_APPROVER } from "./steps";
import { supabaseChainStore } from "./store";
import type { ApprovalsPort, ChainDeps } from "./types";

// The chain's real ports (Z.9): company_os through ./store, the kernel's
// approvals and parked runs, the resume screen, Resend through the kernel
// sender, and the decision RPC. The tests build their own ChainDeps instead.

const approvals: ApprovalsPort = {
  open: (ref) => openApproval({ ...ref, approverPermission: HIRING_APPROVER }, "hiring-chain"),
  decide: (ref) => decidePendingApproval(ref, "hiring-chain"),
  withdraw: async (ref) => {
    const res = await withdrawPendingApproval(ref, "hiring-chain");
    return res.ok ? { ok: true } : res;
  },
  // The kernel's latestApproval does not return who asked, and decision 3
  // needs it (a hire is never approved by its proposer), so the row is read
  // here, raising on a failed read as the kernel's does.
  latest: async (subjectType, subjectId) => {
    const rows = mustRows(
      await companyOs
        .from("approvals")
        .select("id, state, metadata, decided_by, decided_at, requested_by")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1),
      "[hiring/chain] approvals",
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      state: r.state,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      requestedBy: r.requested_by,
    };
  },
};

export const chainDeps: ChainDeps = {
  store: supabaseChainStore,
  approvals,
  runs: {
    park: (tick, summary) => parkRun(CHAIN_ROUTINE_ID, tick, summary),
    close: (tick, outcome) => closeParkedRun(CHAIN_ROUTINE_ID, tick, outcome),
  },
  precheck: async (applicationId) => {
    const input = await candidateTextsFor(applicationId);
    if (!input.ok) throw new Error(`The pre-check could not read the application: ${input.error}`);
    return precheck(input.texts, input.layout);
  },
  screen: async (applicationId) => {
    const res = await screenApplication(applicationId);
    return res.ok ? { ok: true, report: res.report ?? null } : res;
  },
  send: (opts) => sendTransactionalEmail(opts),
  recordDecision: async (applicationId, outcome, reason, by) => {
    const { data, error } = await companyOs.rpc("record_application_decision", {
      p_application: applicationId,
      p_outcome: outcome,
      p_reason: reason,
      // The RPC takes a null approver (no person behind the account); the
      // generated type cannot say so.
      p_by: by as string,
    });
    if (error) throw new Error(`record_application_decision: ${error.message}`);
    return data === true;
  },
  deliverHire: async (applicationId) => {
    const res = await deliverOutbox({ eventName: "candidate.hired", dedupeKey: applicationId });
    if (res.failed > 0) console.error(`[hiring/chain] candidate.hired for ${applicationId} not delivered yet: ${res.errors.join("; ")}`);
  },
  cancelInterviews: async (applicationId) => {
    const res = await cancelScheduledInterviews(applicationId);
    if (!res.ok) console.error(`[hiring/chain] ${applicationId}: the scheduled interviews could not be cancelled: ${res.error}`);
  },
  mode: () => currentRunMode(),
  now: () => new Date(),
  orgName: () => ORG_NAME,
  emailProblem: () => {
    if (!process.env.RESEND_API_KEY) return "RESEND_API_KEY is not set, so no email can be sent.";
    if (!process.env.EMAIL_FROM) return "EMAIL_FROM is not set, so no email has a sender.";
    return null;
  },
};
