import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The submitter's name is written into the model's prompt, and the model may
// copy it into the stored plan. It is read without the email, so a submitter
// with no name reaches the model as "an Edge8 team member", never as their
// address (S.16.10 review, the verifier's probe).

const prompts: string[] = [];
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({
    messages: {
      create: vi.fn(async (req: { messages: { content: string }[] }) => {
        prompts.push(req.messages[0].content);
        throw new Error("stop after the prompt");
      }),
    },
  }),
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { generateIdeaPlan } from "./idea-plan";

const learning = (people: unknown) => ({ id: "i1", kind: "learning", title: "T", story: "S", takeaway: "K", people });

beforeEach(() => {
  resetFake();
  prompts.length = 0;
});

describe("the submitter named in the idea prompt", () => {
  it("is the display name", async () => {
    script("ideas", { data: learning({ display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu" }) }, { data: null });
    await generateIdeaPlan("i1");
    expect(prompts[0]).toContain("# Learning shared by Hiếu Nguyễn");
  });

  it("is \"an Edge8 team member\" for an email-only submitter, never the address", async () => {
    script("ideas", { data: learning({ display_name: null, preferred_name: null, full_name: null, email: "someone@example.com" }) }, { data: null });
    await generateIdeaPlan("i1");
    expect(prompts[0]).toContain("# Learning shared by an Edge8 team member");
    expect(prompts[0]).not.toContain("someone@example.com");
  });

  it("is \"an Edge8 team member\" when the submitter is missing", async () => {
    script("ideas", { data: learning(null) }, { data: null });
    await generateIdeaPlan("i1");
    expect(prompts[0]).toContain("# Learning shared by an Edge8 team member");
  });
});
