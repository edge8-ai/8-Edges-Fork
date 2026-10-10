import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRow } from "./proposal-data";
import { table } from "./testing/proposal-fakes";
import { claimedBySkill, kernel } from "./testing/kernel-fakes";
import { BY, DEAL, fakeModel, PROPOSAL_STAGE, seed } from "./testing/proposal-seed";

// Z.10, the decision: approve decides only the version the approver read,
// once under two concurrent clicks; an edit after approval sends the run back
// to ready with a new approval and closes the old wait as superseded; the
// skill's claim on the shared key makes the chain's publish a skip; record
// moves the deal only when the forecast gate allows and writes its note once;
// approving and rejecting need crm.proposal-approve, which no api/ route
// reaches.

vi.mock("./proposal-pricing", async () => ({ PROPOSAL_HOUSE: (await import("./testing/test-house")).TEST_HOUSE }));
vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/proposal-fakes")).fakeCompanyOs }));
vi.mock("@/kernel/approvals/requests", async () => (await import("./testing/kernel-fakes")).requestsFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("./testing/kernel-fakes")).waitingFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("./testing/kernel-fakes")).parksFake);
vi.mock("@/kernel/audit/effects", async () => (await import("./testing/kernel-fakes")).effectsFake);
vi.mock("@/kernel/audit/routine-runs", async () => (await import("./testing/kernel-fakes")).routineRunsFake);
vi.mock("@/kernel/audit/routine-config", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { routineSwitches: async () => new Map(k.switchMode ? [["/api/cron/proposal-chain/", { mode: k.switchMode }]] : []) };
});
vi.mock("@/kernel/identity/people-holding", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { peopleHolding: async () => k.holders };
});
vi.mock("@/kernel/messaging/lark-api", async () => {
  const { kernel: k } = await import("./testing/kernel-fakes");
  return { sendLarkDm: async (email: string, text: string) => (k.dms.push({ email, text }), true) };
});
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: async () => true }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://app.example.test" }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async () => {} }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: () => {} }));
vi.mock("@/entities/contacts", async () => {
  const { fakeCompanyOs } = await import("./testing/proposal-fakes");
  return { selectPersonCompanies: (cols: string) => fakeCompanyOs.from("person_companies").select(cols) };
});
vi.mock("./lifecycle", () => ({ bumpCompanyLifecycle: vi.fn(async () => {}) }));
const moves: { dealId: string; toStageId: string }[] = [];
vi.mock("./deal-close", () => ({
  moveDealToStage: vi.fn(async (input: { dealId: string; toStageId: string }) => (moves.push(input), { ok: true })),
}));
const granted = new Set<string>();
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: vi.fn(async (atom: string) => {
    if (!granted.has(atom)) throw new Error(`refused: ${atom}`);
    return { personId: "00000000-0000-4000-8000-0000000000a1", user: { email: "approver@example.test" }, may: (a: string) => granted.has(a) };
  }),
}));

const { driveAgents } = await import("@/kernel/audit/step-driver");
const { discover, proposalDriven, restartProposal, useProposalModel } = await import("./proposal-chain");
const { approveProposal, proposalVersion } = await import("./proposal-approval");
const { askContextFor, publish, publishKey, record } = await import("./proposal-outward");
const { editProposal } = await import("./proposal-edit");
const { approveProposalAction, rejectProposalAction } = await import("./proposal-decide-actions");

const draft = () => table("proposal_drafts")[0] as unknown as DraftRow;
const tick = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await discover();
    await driveAgents([proposalDriven]);
  }
};

beforeEach(async () => {
  seed();
  moves.length = 0;
  granted.clear();
  useProposalModel(fakeModel());
  kernel.holders = [BY.personId];
  kernel.switchMode = "live";
  await tick(4);
  expect(draft().step).toBe("ready");
});

const ctx = async () => askContextFor(draft());

describe("approving", () => {
  it("decides nothing for a version the page no longer shows, and says reload", async () => {
    const res = await approveProposal(draft().id, "stale0000000", BY, await ctx());
    expect(res).toEqual({ ok: false, error: expect.stringContaining("Reload") });
    expect(draft().step).toBe("ready");
    expect(kernel.approvals.filter((a) => a.state === "approved")).toHaveLength(0);
  });

  it("decides once under two concurrent clicks", async () => {
    const v = proposalVersion(draft());
    const c = await ctx();
    const results = await Promise.all([approveProposal(draft().id, v, BY, c), approveProposal(draft().id, v, { ...BY, email: "second@example.test" }, c)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(kernel.approvals.filter((a) => a.state === "approved")).toHaveLength(1);
    expect(draft().step).toBe("publish");
  });

  it("refuses a proposal with no deal, which would reach no portal", async () => {
    draft().deal_id = null;
    const res = await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx());
    expect(res).toEqual({ ok: false, error: expect.stringContaining("no deal") });
  });
});

describe("an edit", () => {
  it("after approval and before publish sends the run back to ready with a new approval, the old wait superseded", async () => {
    const v1 = proposalVersion(draft());
    expect(await approveProposal(draft().id, v1, BY, await ctx())).toEqual({ ok: true });
    expect(draft().step).toBe("publish");
    const edited = await editProposal(draft().id, { part: "idea", heading: "A sharper idea", body: "One database the client owns." }, v1, BY);
    expect(edited.ok).toBe(true);
    expect(edited.version).not.toBe(v1);
    expect(draft().step).toBe("ready");
    const pending = kernel.approvals.filter((a) => a.state === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].metadata.version).toBe(edited.version);
    // The AI's own words stay beside the edit.
    expect(JSON.stringify(draft().ai_sections)).not.toContain("A sharper idea");
    expect(JSON.stringify(draft().sections)).toContain("A sharper idea");
  });

  it("while waiting withdraws the pending approval and closes its wait as superseded", async () => {
    const v1 = proposalVersion(draft());
    await editProposal(draft().id, { part: "head", headline: "A new headline", sub: "Same plan." }, v1, BY);
    expect(kernel.approvals.map((a) => a.state)).toEqual(["cancelled", "pending"]);
    expect(kernel.parks[0]).toMatchObject({ status: "skipped", summary: expect.stringContaining("superseded") });
  });
});

describe("the shared publish key", () => {
  it("claimed by the skill makes the chain's publish a skip that points at the live page", async () => {
    claimedBySkill(publishKey(draft()), "https://site.example.test/proposals/example-co.html");
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    const out = await publish(draft());
    expect(out).toMatchObject({ next: "done", summary: "skipped: published by the skill" });
    expect(table("deals").find((d) => d.id === DEAL)?.proposal_url).toBeNull();
  });

  it("claimed by the skill but not settled stops the publish rather than calling it published", async () => {
    claimedBySkill(publishKey(draft()), null, "unknown");
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    await expect(publish(draft())).rejects.toThrow("not settled");
    expect(draft().step).toBe("publish");
  });
});

describe("the edit and publish race", () => {
  it("refuses an edit that lands after the approval published the page, and leaves the page as approved", async () => {
    const v1 = proposalVersion(draft());
    expect(await approveProposal(draft().id, v1, BY, await ctx())).toEqual({ ok: true });
    await tick(1);
    expect(draft().step).toBe("record");
    const before = JSON.stringify(draft().sections);
    const edited = await editProposal(draft().id, { part: "idea", heading: "Unapproved", body: "Words nobody approved." }, v1, BY);
    expect(edited.ok).toBe(false);
    expect(JSON.stringify(draft().sections)).toBe(before);
    expect(draft().version).toBe(v1);
  });

  it("refuses an edit made against a version that has since changed", async () => {
    const v1 = proposalVersion(draft());
    expect((await editProposal(draft().id, { part: "idea", heading: "First edit", body: "One." }, v1, BY)).ok).toBe(true);
    const second = await editProposal(draft().id, { part: "idea", heading: "Second edit", body: "Two." }, v1, BY);
    expect(second.ok).toBe(false);
    expect(JSON.stringify(draft().sections)).toContain("First edit");
  });

  it("puts nothing live when the row's version moved between the gate and the write", async () => {
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    draft().version = "edited000000";
    await expect(publish(draft())).rejects.toThrow("changed while it was being published");
    expect(draft().published_at ?? null).toBeNull();
    expect(table("deals").find((d) => d.id === DEAL)?.proposal_url).toBeNull();
    expect(kernel.effects.get(publishKey(draft()))?.status).toBe("released");
  });
});

describe("retry after the page went live", () => {
  it("finishes the run by recording again and keeps the live page, never drafting again", async () => {
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    await tick(1);
    expect(draft().step).toBe("record");
    const url = draft().published_url;
    // The record step ran out of attempts and the driver stopped the run.
    Object.assign(draft(), { step: "stopped", error: "interactions: insert failed" });
    const retried = await restartProposal(draft().id);
    expect(retried.ok).toBe(true);
    expect(draft()).toMatchObject({ step: "done", published_url: url });
    expect(draft().published_at).toBeTruthy();
    expect(table("deals").find((d) => d.id === DEAL)?.proposal_url).toBe(url);
  });
});

describe("record", () => {
  it("leaves the deal where it is without an amount and a close date, and writes the note once across retries", async () => {
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    await tick(1);
    expect(draft().step).toBe("record");
    const first = await record(draft());
    expect(first.summary).toContain("add amount and expected close date");
    await record(draft());
    expect(table("interactions")).toHaveLength(1);
    expect(moves).toHaveLength(0);
  });

  it("moves the deal to Proposal when the forecast inputs are there", async () => {
    Object.assign(table("deals").find((d) => d.id === DEAL) ?? {}, { amount_cents: 240_000, expected_close_date: "2026-11-01" });
    expect(await approveProposal(draft().id, proposalVersion(draft()), BY, await ctx())).toEqual({ ok: true });
    await tick(2);
    expect(draft().step).toBe("done");
    expect(moves).toEqual([expect.objectContaining({ dealId: DEAL, toStageId: PROPOSAL_STAGE })]);
    expect(kernel.dms.some((d) => d.email === "owner@example.test")).toBe(true);
  });
});

describe("the guards", () => {
  it("refuse approve and reject to a Revenue member without crm.proposal-approve", async () => {
    granted.add("crm.pipeline");
    await expect(approveProposalAction(draft().id, proposalVersion(draft()))).rejects.toThrow("refused: crm.proposal-approve");
    await expect(rejectProposalAction(draft().id, "no")).rejects.toThrow("refused: crm.proposal-approve");
    expect(draft().step).toBe("ready");
  });

  it("let the Revenue approver approve and publish in one click", async () => {
    granted.add("crm.proposal-approve");
    const res = await approveProposalAction(draft().id, proposalVersion(draft()));
    expect(res).toEqual({ ok: true, note: "Approved and published." });
    expect(draft().step).toBe("record");
  });

  it("are reached by no api/ route", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/proposal-(approval|decide-actions)/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    for (const entity of readdirSync("entities")) {
      const api = join("entities", entity, "api");
      try {
        if (statSync(api).isDirectory()) walk(api);
      } catch {
        // An entity with no api/ has nothing to check.
      }
    }
    expect(hits).toEqual([]);
  });
});
