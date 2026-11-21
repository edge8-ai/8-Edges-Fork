import { describe, expect, it, vi } from "vitest";

// Revenue today's "Personal emails to approve" (RT.1): held and drafted
// messages across every agent, oldest first, each with its agent's name. A
// failed read says so rather than answering "nothing is waiting".
const db = vi.hoisted(() => ({ list: { data: [] as unknown[], error: null as null | { message: string }, count: 0 }, agents: { data: [] as unknown[], error: null as null | { message: string } }, asked: [] as unknown[] }));
vi.mock("@/kernel/data/supabase", () => {
  const listChain: Record<string, unknown> = {};
  listChain.select = () => listChain;
  listChain.in = (col: string, vals: unknown) => (db.asked.push([col, vals]), listChain);
  listChain.order = () => listChain;
  listChain.limit = async () => db.list;
  return {
    companyOs: {
      from: (t: string) => (t === "email_agents" ? { select: async () => db.agents } : listChain),
    },
  };
});
vi.mock("@/entities/contacts", () => ({ brandNames: async () => new Map() }));

const { messagesAwaitingApproval } = await import("./data");

const row = (id: string, agent: string) => ({ id, agent_id: agent, skill_id: "s", person_id: "p", routine_run_id: null, status: "drafted", hold_reason: null, skip_reason: null, subject: `Subject ${id}`, body_md: "Hi", facts: [], edited_at: null, approved_by: null, approved_at: null, send_after: null, claimed_at: null, sent_at: null, resend_email_id: null, error: null, interaction_id: null, created_at: "", updated_at: "", email_agent_skills: null, people: null });

describe("messagesAwaitingApproval", () => {
  it("reads held and drafted messages, with each agent's name and the full count", async () => {
    db.list = { data: [row("m1", "a1")], error: null, count: 6 };
    db.agents = { data: [{ id: "a1", name: "Edge8 weekly" }], error: null };
    const out = await messagesAwaitingApproval();
    expect(db.asked).toContainEqual(["status", ["held", "drafted"]]);
    expect(out.total).toBe(6);
    expect(out.rows.map((r) => [r.id, r.agentName, r.subject])).toEqual([["m1", "Edge8 weekly", "Subject m1"]]);
  });

  it("says a failed read failed instead of answering none", async () => {
    db.list = { data: [], error: { message: "boom" }, count: 0 };
    expect(await messagesAwaitingApproval()).toEqual({ rows: [], total: 0, error: "boom" });
  });
});
