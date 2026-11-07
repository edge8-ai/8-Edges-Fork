import { beforeEach, describe, expect, it, vi } from "vitest";

// S.1, SR.2.2. Hiring answers the global search with candidates, admin only:
// the team hub has no candidate screen to open. A candidate's name and email
// live on their person row, and the database's company_os.search_candidates
// matches the candidate's live person and ranks the candidates themselves, in
// one read (matching and order proved in the SR.2.1 migration's proof). Each
// hit opens its candidate page.
const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args) } }));

import type { AdminUser } from "@/kernel/identity/admin-auth";
import type { SearchActor } from "@/kernel/identity/search-actor";
import { ReadFailure } from "@/kernel/data/read";
import { searchContributions } from "./search";

const [candidates] = searchContributions;
const ADMIN: SearchActor = { surface: "admin", admin: { id: "u1", email: "a@x.test" } as AdminUser, access: { may: () => true } };

beforeEach(() => rpc.mockReset());

describe("hiring's search contribution", () => {
  it("offers candidates on the admin surface only, by the candidate page each opens", () => {
    expect(searchContributions.map((c) => [c.kind, c.opens])).toEqual([["candidate", { admin: "/admin/talent/candidates/[id]" }]]);
  });

  it("asks the ranked candidate search, names each candidate by their person, and opens the candidate page", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "c1", current_title: "Designer", display_name: "Lan Pham", preferred_name: null, full_name: "Pham Lan", email: "lan@x.test", score: 60 }],
      error: null,
    });
    const hits = await candidates.search(ADMIN, ["lan"], 5);
    expect(rpc).toHaveBeenCalledWith("search_candidates", { terms: ["lan"], lim: 5 });
    expect(hits).toEqual([{ id: "c1", title: "Lan Pham", detail: "Designer", href: "/admin/talent/candidates/c1" }]);
  });

  it("raises a failed read rather than answering that nobody matched", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(candidates.search(ADMIN, ["lan"], 5)).rejects.toBeInstanceOf(ReadFailure);
  });
});
