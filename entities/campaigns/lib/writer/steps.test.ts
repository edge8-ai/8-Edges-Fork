import { describe, expect, it } from "vitest";
import { WRITER_STEPS, WRITER_DONE, WRITER_READY, describeState, isWriterStep, nextState } from "./steps";

describe("writer steps", () => {
  it("run in the process order; validate parks at ready unless the brand auto-publishes", () => {
    expect(WRITER_STEPS.map((s) => s.id)).toEqual(["draft", "edit", "seo", "exhibits", "hero", "links", "assemble", "validate", "channels", "publish"]);
    expect(nextState("draft", false)).toBe("edit");
    expect(nextState("validate", false)).toBe(WRITER_READY);
    expect(nextState("validate", true)).toBe("channels");
    expect(nextState("channels", true)).toBe("publish");
    expect(nextState("publish", true)).toBe(WRITER_DONE);
  });
  it("describes the state for the hub", () => {
    expect(describeState("exhibits")).toBe("Step 4 of 10: Exhibits");
    expect(describeState(WRITER_READY)).toBe("Ready to publish");
    expect(describeState(WRITER_DONE)).toBe("Published");
  });
  it("knows what is and is not a step", () => {
    expect(isWriterStep("seo")).toBe(true);
    expect(isWriterStep("ready")).toBe(false);
    expect(isWriterStep("done")).toBe(false);
    expect(isWriterStep(null)).toBe(false);
  });
});

// Decision Y.53: only our own brand may publish with no click.
describe("mayAutoPublish", () => {
  it("lets only the self brand auto-publish", async () => {
    const { mayAutoPublish } = await import("../brand-profiles");
    expect(mayAutoPublish("edge8")).toBe(true);
    expect(mayAutoPublish("ai-officer")).toBe(false);
  });
});
