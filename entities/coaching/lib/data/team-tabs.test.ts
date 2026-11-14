import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { relationshipOf } from "./team-tabs";

// The Dotted Line tab's label comes from the org chart, never from a tag.
describe("relationshipOf", () => {
  it("is direct when the leader is their manager", () => {
    expect(relationshipOf("me", "me", "boss")).toBe("direct");
  });
  it("is skip-level when the leader manages their manager", () => {
    expect(relationshipOf("me", "mgr", "me")).toBe("skip");
  });
  it("is dotted line otherwise", () => {
    expect(relationshipOf("me", "mgr", "other")).toBe("dotted");
    expect(relationshipOf("me", null, null)).toBe("dotted");
  });
});
