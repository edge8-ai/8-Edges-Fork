import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// TR.23.4, from the boundary review of PR #2672. A candidate's email is signed
// by, and replied to, the job's recruiter; with no recruiter the hiring manager
// stands in. On a staffing job the hiring manager may be the client's own CRM
// contact, so these pin that the stand-in is only ever someone on our team now:
// a client contact is never the reply-to nor the name an email is signed with.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
const team = vi.hoisted(() => ({ personIdOfTeamMember: vi.fn(), currentTeamEmails: vi.fn() }));
vi.mock("@/kernel/identity/team-people", () => team);

const { supabaseChainStore } = await import("./store");

const CANDIDATE = { display_name: "Thu Nguyen", preferred_name: null, full_name: "Thu Nguyen", email: "thu@example.com" };
const MANAGER = { display_name: "Morgan Manager", preferred_name: null, full_name: null, email: "morgan@example.com" };
const RECRUITER = { display_name: "Robin Recruiter", preferred_name: null, full_name: null, email: "robin@example.com" };

function job(over: { recruiter_id?: string | null; hiring_manager_id?: string | null }) {
  script("applications", { data: [{ person_id: "candidate", job_requisition_id: "job" }] });
  script("job_requisitions", { data: [{ title: "Data engineer", recruiter_id: null, hiring_manager_id: null, ...over }] });
  script("requisition_loop_steps", { data: [] });
}

beforeEach(() => {
  resetFake();
  vi.clearAllMocks();
});

describe("who a candidate's email comes from", () => {
  it("is the recruiter when the job has one, without asking who is on the team", async () => {
    job({ recruiter_id: "tm-robin", hiring_manager_id: "manager" });
    team.personIdOfTeamMember.mockResolvedValue("robin");
    script("people", { data: [CANDIDATE] }, { data: [RECRUITER] });
    const ctx = await supabaseChainStore.messageContext("app-1", null);
    expect(ctx.replyTo).toBe("robin@example.com");
    expect(ctx.facts.recruiterName).toBe("Robin Recruiter");
    expect(team.currentTeamEmails).not.toHaveBeenCalled();
  });

  it("is a hiring manager on our team when there is no recruiter", async () => {
    job({ hiring_manager_id: "manager" });
    team.currentTeamEmails.mockResolvedValue(new Map([["manager", "morgan@example.com"]]));
    script("people", { data: [CANDIDATE] }, { data: [MANAGER] });
    const ctx = await supabaseChainStore.messageContext("app-1", null);
    expect(team.currentTeamEmails).toHaveBeenCalledWith(["manager"]);
    expect(ctx.replyTo).toBe("morgan@example.com");
    expect(ctx.facts.recruiterName).toBe("Morgan Manager");
  });

  it("is never a client's contact: no reply-to and no name to sign with, and their row is not read", async () => {
    job({ hiring_manager_id: "client-contact" });
    team.currentTeamEmails.mockResolvedValue(new Map());
    // Only the candidate's row is scripted, so a read of the contact's row would throw.
    script("people", { data: [CANDIDATE] });
    const ctx = await supabaseChainStore.messageContext("app-1", null);
    expect(ctx.toEmail).toBe("thu@example.com");
    expect(ctx.replyTo).toBeNull();
    expect(ctx.facts.recruiterName).toBeNull();
  });
});
