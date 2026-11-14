import { beforeEach, describe, expect, it, vi } from "vitest";

// A résumé is recruiting data: the download asks for hiring.ats, the permission
// every recruiting page asks for, and reads nothing for anyone without it.

const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { storage_path: "r/1.pdf" }, error: null }) }) }),
}));
const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://storage.example/signed" }, error: null }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from },
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));
const getAccess = vi.fn();
vi.mock("@/kernel/identity/access-request", () => ({ getAccess }));

const { GET } = await import("./route");
const call = () => GET(new Request("https://www.example.com/admin/talent/resume/doc-1"), { params: Promise.resolve({ id: "doc-1" }) });

beforeEach(() => {
  from.mockClear();
  createSignedUrl.mockClear();
});

describe("the résumé download", () => {
  it("sends someone not signed in to sign in, before reading anything", async () => {
    getAccess.mockResolvedValueOnce(null);
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.example.com/admin/login");
    expect(from).not.toHaveBeenCalled();
  });

  it("answers 404 to an admin without hiring.ats, before reading anything", async () => {
    getAccess.mockResolvedValueOnce({ may: (p: string) => p === "crm.contacts" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("redirects a holder of hiring.ats to a short-lived signed URL", async () => {
    getAccess.mockResolvedValueOnce({ may: (p: string) => p === "hiring.ats" });
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://storage.example/signed");
    expect(createSignedUrl).toHaveBeenCalledWith("r/1.pdf", 300);
  });
});
