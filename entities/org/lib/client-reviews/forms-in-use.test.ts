import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.1.5: whether an open client review cycle uses a form, which freezes it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { ReadFailure } from "@/kernel/data/read";
import { isFormInOpenCycle } from "./forms-in-use";

const FORM = "ea130000-0000-4000-8000-000000000001";

beforeEach(() => resetFake());

describe("isFormInOpenCycle", () => {
  it("is false for a form no framework uses, without asking about cycles", async () => {
    script("review_frameworks", { data: [] });
    expect(await isFormInOpenCycle(FORM)).toBe(false);
  });

  it("is true while a cycle on a framework that uses the form is open", async () => {
    script("review_frameworks", { data: [{ id: "fw-1" }] });
    script("review_cycles", { count: 1 });
    expect(await isFormInOpenCycle(FORM)).toBe(true);
  });

  it("is false once every such cycle is closed", async () => {
    script("review_frameworks", { data: [{ id: "fw-1" }] });
    script("review_cycles", { count: 0 });
    expect(await isFormInOpenCycle(FORM)).toBe(false);
  });

  it("raises when it cannot tell, rather than unlocking the form", async () => {
    script("review_frameworks", { error: { message: "connection reset" } });
    await expect(isFormInOpenCycle(FORM)).rejects.toBeInstanceOf(ReadFailure);
  });
});
