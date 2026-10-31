import { beforeEach, describe, expect, it, vi } from "vitest";

const accept = vi.fn();
vi.mock("../../../lib/proposal-accept", () => ({
  acceptProposal: (id: string) => accept(id),
  verifyProposalAcceptToken: (t: string) => (t === "good" ? "deal-1" : null),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new Request("https://example.test/api/proposals/accept", { method: "POST", body: JSON.stringify(body) }) as never);

describe("POST /api/proposals/accept", () => {
  beforeEach(() => accept.mockReset());

  it("answers a filled honeypot like a success and accepts nothing", async () => {
    const res = await post({ token: "good", website: "spam" });
    expect(res.status).toBe(200);
    expect(accept).not.toHaveBeenCalled();
  });

  it("refuses a token that does not verify, and accepts nothing", async () => {
    const res = await post({ token: "forged" });
    expect(res.status).toBe(403);
    expect(accept).not.toHaveBeenCalled();
  });

  it("accepts the deal the token names", async () => {
    accept.mockResolvedValue({ status: "accepted", firstName: "Mitch" });
    const res = await post({ token: "good" });
    expect(accept).toHaveBeenCalledWith("deal-1");
    expect(await res.json()).toEqual({ ok: true, already: false, firstName: "Mitch" });
  });

  it("says so when the proposal was already accepted", async () => {
    accept.mockResolvedValue({ status: "already", firstName: "Mitch" });
    expect(await (await post({ token: "good" })).json()).toMatchObject({ ok: true, already: true });
  });

  it("hides the reason a refusal gives from the public", async () => {
    accept.mockResolvedValue({ status: "refused", reason: "The deal has no owner to prepare the contract." });
    const res = await post({ token: "good" });
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toMatch(/owner/);
  });
});
