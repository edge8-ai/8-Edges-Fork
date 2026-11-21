import { describe, expect, it } from "vitest";
import { callTypeFromTitle } from "./zoom-client-calls";

// The tag decides whether the meeting-type routine marks a Zoom call Sales
// without a model read, so it must agree with the Lark Minutes sync's rules.
describe("callTypeFromTitle", () => {
  it("tags a discovery call sales", () => {
    expect(callTypeFromTitle("Jo Example and Sam Host: AI Discovery Call")).toBe("sales");
  });

  it("tags internal and client calls as the Lark sync does", () => {
    expect(callTypeFromTitle("Leadership sync")).toBe("internal");
    expect(callTypeFromTitle("Weekly Acme <> Vendor Sync")).toBe("client");
    expect(callTypeFromTitle("Jo Example and Sam Host: AI Program Review")).toBe("other");
  });
});
