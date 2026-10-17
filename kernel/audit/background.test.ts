import { describe, expect, it, vi } from "vitest";

// Y.24: a background AI job is a run with one retry, and a job that fails
// twice is an error run naming its subject (never a person's name).

vi.mock("@vercel/functions", () => ({ waitUntil: () => undefined }));
const { backgroundJob } = await import("./background");

describe("backgroundJob", () => {
  it("is ok on a first success, with one attempt", async () => {
    const job = vi.fn(async () => ({ ok: true as const }));
    const res = await backgroundJob("application a1", job, 0);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", subject: "application a1", attempts: 1, failures: [] });
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("retries once, and a second success is ok", async () => {
    const job = vi.fn().mockResolvedValueOnce({ ok: false, error: "overloaded" }).mockResolvedValueOnce({ ok: true });
    const res = await backgroundJob("meeting m1", job, 0);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ attempts: 2, failures: [] });
  });

  it("is an error run naming the subject when both attempts fail, a throw included", async () => {
    const job = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ ok: false, error: "credit balance is too low" });
    const res = await backgroundJob("interview i1", job, 0);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("interview i1 at attempt 2: credit balance is too low");
  });
});
