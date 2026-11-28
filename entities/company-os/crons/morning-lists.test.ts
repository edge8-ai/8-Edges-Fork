import { describe, expect, it } from "vitest";
import { sinceLastList } from "./morning-lists";

describe("sinceLastList", () => {
  it("is yesterday's list on a weekday", () => {
    expect(sinceLastList("2026-11-19")).toBe("2026-11-18T01:30:00Z");
  });

  it("reaches back over the weekend on a Monday", () => {
    expect(sinceLastList("2026-11-23")).toBe("2026-11-20T01:30:00Z");
  });
});
