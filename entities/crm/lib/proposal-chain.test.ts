import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRow } from "./proposal-data";
import { table } from "./testing/proposal-fakes";
import { approvals } from "@/kernel/approvals/testing/fake";
import { kernel } from "./testing/kernel-fakes";
import { BY, CO, DEAL, fakeModel, MEETING, PROPOSAL_STAGE, seed, TRANSCRIPT_ONLY } from "./testing/proposal-seed";

// Z.10, the plan's three tests and the shadow rule, on in-memory fakes of the
// tables and the kernel (./testing): a re-run makes one row, one approval and
// one publish; a rejected approval never publishes; a failed model call
// leaves no effect and, after three attempts, a stopped run that says why; a
// shadow run sends, asks and publishes nothing.

vi.mock("./proposal-pricing", async () => ({ PROPOSAL_HOUSE: (await import("./testing/test-house")).TEST_HOUSE }));
vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/proposal-fakes")).fakeCompanyOs }));
vi.mock("@/kernel/approvals/requests", async () => (await import("@/kernel/approvals/testing/fake")).requestsFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("@/kernel/approvals/testing/fake")).waitingFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("./testing/kernel-fakes")).parksFake);
vi.mock("@/kernel/audit/effects", async () => (await import("./testing/kernel-fakes")).effectsFake);
vi.mock("@/kernel/audit/routine-runs", async () => (await import("./testing/kernel-fakes")).routineRunsFake);
vi.mock("@/kernel/audit/routine-config", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { readRoutineSwitch: async () => ({ ok: true, row: k.switchMode ? { mode: k.switchMode, reason: null } : null }) };
});
vi.mock("@/kernel/identity/people-holding", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { peopleHolding: async () => k.holders };
});
vi.mock("@/kernel/messaging/lark-api", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return {
    sendLarkDm: async (email: string, text: string) => {
      if (k.runMode === "shadow") return false;
      k.dms.push({ email, text });
      return true;
    },
  };
});
vi.mock("@/kernel/messaging/lark", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { notifyOps: async (m: unknown) => (k.ops.push(String(m)), true) };
});
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://app.example.test" }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/entities/contacts", async () => {
  const { fakeCompanyOs } = await import("./testing/proposal-fakes");
  // contacts' question (A.64), answered by the fake with the embed it names.
  return {
    contactLinksOfCompany: (companyId: string) =>
      fakeCompanyOs.from("person_companies").select("person_id, people:people!person_id(id, display_name, preferred_name, full_name, email)").eq("company_id", companyId),
  };
});
vi.mock("./lifecycle", () => ({ bumpCompanyLifecycle: vi.fn(async () => {}) }));
vi.mock("./deal-close", async () => {
  const { table: t } = await import("./testing/proposal-fakes");
  return {
    moveDealToStage: vi.fn(async (input: { dealId: string; toStageId: string }) => {
      const deal = t("deals").find((d) => d.id === input.dealId);
      if (deal) deal.stage_id = input.toStageId;
      return { ok: true };
    }),
  };
});

const { driveAgents, MAX_ATTEMPTS } = await import("@/kernel/audit/step-driver");
const { discover, proposalDriven, runNow, useProposalModel } = await import("./proposal-chain");
const { approveProposal, rejectProposal, proposalVersion } = await import("./proposal-approval");
const { askContextFor, publish, publishKey } = await import("./proposal-outward");
const { effectsFake } = await import("./testing/kernel-fakes");

const drafts = () => table("proposal_drafts") as unknown as DraftRow[];
const draft = () => drafts()[0];
const tick = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await discover();
    await driveAgents([proposalDriven]);
  }
};

let model = fakeModel();
beforeEach(() => {
  seed();
  model = fakeModel();
  useProposalModel(model);
  kernel.holders = [BY.personId];
});

async function toReady() {
  kernel.switchMode = "live";
  await tick(4);
  expect(draft().step).toBe("ready");
}

describe("an idempotent re-run", () => {
  it("makes one row, one approval and one publish across repeated ticks, and a second publish claim does nothing", async () => {
    await toReady();
    await tick(2);
    expect(drafts()).toHaveLength(1);
    expect(approvals.rows).toHaveLength(1);
    expect(kernel.dms).toEqual([expect.objectContaining({ email: "approver@example.test" })]);

    const row = draft();
    expect(await approveProposal(row.id, proposalVersion(row), BY, await askContextFor(row))).toEqual({ ok: true });
    await tick(4);
    expect(draft().step).toBe("done");
    const deal = table("deals").find((d) => d.id === DEAL);
    expect(deal?.proposal_url).toBe(draft().published_url);
    expect(deal?.stage_id).not.toBe(PROPOSAL_STAGE); // no amount or close date applied, so the gate left it
    expect([...kernel.effects.entries()].filter(([, e]) => e.kind === "publish")).toHaveLength(1);
    expect(table("interactions")).toHaveLength(1);

    const again = await effectsFake.once(publishKey(draft()), "publish", async () => ({ ok: true }));
    expect(again.acted).toBe(false);
    expect(model.extract).toHaveBeenCalledTimes(1);
    expect(model.draft).toHaveBeenCalledTimes(1);
  });

  it("never sends the raw transcript to the draft call", async () => {
    await toReady();
    expect(JSON.stringify(model.draft.mock.calls[0][0])).not.toContain(TRANSCRIPT_ONLY);
    expect(model.extract.mock.calls[0][0].screened.text).toContain(TRANSCRIPT_ONLY);
    expect(draft().inputs).not.toHaveProperty("transcript");
    expect(JSON.stringify(draft().inputs)).not.toContain(TRANSCRIPT_ONLY);
  });
});

describe("a rejected approval", () => {
  it("never publishes, even when a stale tick reaches publish", async () => {
    await toReady();
    expect(await rejectProposal(draft().id, BY, "Wrong scope")).toEqual({ ok: true });
    expect(draft().step).toBe("rejected");
    // A tick that read the row before the rejection, at publish.
    draft().step = "publish";
    const out = await publish(draft());
    expect(out.next).toBe("rejected");
    expect(table("deals").find((d) => d.id === DEAL)?.proposal_url).toBeNull();
    expect([...kernel.effects.values()].some((e) => e.kind === "publish")).toBe(false);
  });
});

describe("a failed model call", () => {
  it("leaves no effect, and after three attempts stops the run with the provider's reason", async () => {
    kernel.switchMode = "live";
    model.extract.mockRejectedValue(new Error("The AI provider refused the proposal-extract call (HTTP 400): Your credit balance is too low."));
    await tick(1); // gather
    await tick(3); // three failed attempts at extract
    expect(draft().step).toBe("extract");
    expect(kernel.effects.size).toBe(0);
    expect(table("automation_effects")).toHaveLength(0);
    await tick(1); // the driver gives up
    expect(draft().step).toBe("stopped");
    expect(draft().error).toContain("credit balance is too low");
    expect(kernel.ops.some((m) => m.includes("stopped a run at extract"))).toBe(true);
    expect(approvals.rows).toHaveLength(0);
    expect(kernel.dms).toHaveLength(0);
  });
});

describe("shadow", () => {
  it("with no switch set, drafts in shadow and stops: no approval, no DM, no effect, nothing published", async () => {
    await tick(5);
    expect(draft()).toMatchObject({ mode: "shadow", step: "shadow-done" });
    expect(draft().published_url ?? null).toBeNull();
    expect(draft().html).toContain("<h2>What we heard</h2>");
    expect(approvals.rows).toHaveLength(0);
    expect(kernel.dms).toHaveLength(0);
    expect(kernel.effects.size).toBe(0);
    expect(table("deals").find((d) => d.id === DEAL)?.proposal_url).toBeNull();
  });

  it("holds a live run's outward step while a tick runs in shadow", async () => {
    kernel.switchMode = "live";
    await tick(3);
    expect(draft()).toMatchObject({ mode: "live", step: "ask" });
    kernel.switchMode = "shadow";
    kernel.runMode = "shadow";
    await driveAgents([proposalDriven]);
    kernel.runMode = "live";
    expect(draft().step).toBe("ask");
    expect(approvals.rows).toHaveLength(0);
  });

  // A.43: the button used to answer this wait as a failed step, a 422 the
  // recorder logged as an error under the step's tick, and the driver counts
  // every error of a tick as an attempt whatever its mode. Three presses in
  // shadow stopped the live run before it ever asked.
  it("a person's button on a live run's outward step waits in shadow, and spends none of the live run's attempts", async () => {
    kernel.switchMode = "live";
    await tick(3);
    expect(draft()).toMatchObject({ mode: "live", step: "ask" });
    kernel.switchMode = "shadow";
    for (let press = 0; press < MAX_ATTEMPTS; press++) {
      expect(await runNow(draft().id)).toEqual({ skipped: expect.stringContaining("waits until the switch"), id: draft().id });
    }
    expect(table("routine_runs").filter((r) => r.status === "error")).toHaveLength(0);
    kernel.switchMode = "live";
    await tick(1);
    expect(draft().step).toBe("ready");
    expect(approvals.rows).toHaveLength(1);
  });
});

describe("discovery", () => {
  it("opens a run only for a sales call, summarised, with a company, created since go-live", async () => {
    const meetings = table("meetings");
    meetings.push(
      { id: "m-ceremony", company_id: CO, meeting_type: "Team Ceremony", ai_status: "ready", archived_at: null, created_at: "2026-10-12T02:00:00Z" },
      { id: "m-archived", company_id: CO, meeting_type: "Sales", ai_status: "ready", archived_at: "2026-10-12T03:00:00Z", created_at: "2026-10-12T02:00:00Z" },
      { id: "m-old", company_id: CO, meeting_type: "Sales", ai_status: "ready", archived_at: null, created_at: "2026-09-01T02:00:00Z" },
      { id: "m-nocompany", company_id: null, meeting_type: "Sales", ai_status: "ready", archived_at: null, created_at: "2026-10-12T02:00:00Z" },
      { id: "m-pending", company_id: CO, meeting_type: "Sales", ai_status: "pending", archived_at: null, created_at: "2026-10-12T02:00:00Z" },
      { id: "m-general-call", company_id: CO, meeting_type: "General", ai_status: "ready", archived_at: null, created_at: "2026-10-12T02:00:00Z" },
    );
    table("call_transcripts").push({ id: "ct-2", meeting_id: "m-general-call", call_type: "sales", transcript: "x", created_at: "2026-10-12T02:00:00Z" });
    expect(await discover()).toBe(2);
    expect(drafts().map((d) => d.meeting_id).sort()).toEqual([MEETING, "m-general-call"].sort());
    expect(await discover()).toBe(0);
  });

  it("starts a General meeting from the button, whatever its type", async () => {
    table("meetings")[0].meeting_type = "General";
    expect(await discover()).toBe(0);
    const { startProposal } = await import("./proposal-chain");
    const started = await startProposal(MEETING, CO, BY.personId);
    expect(started.opened).toBe(true);
    expect(draft()).toMatchObject({ meeting_id: MEETING, step: "extract", mode: "shadow" });
  });
});
