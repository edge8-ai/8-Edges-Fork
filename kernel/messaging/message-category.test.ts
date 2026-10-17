import { describe, expect, it } from "vitest";
import { categoryForEmail } from "./message-category";

// The migration that added interactions.category backfilled existing emails by
// these same rules, so a change here should be a deliberate change there too.
describe("categoryForEmail", () => {
  it("takes an explicit category first", () => {
    expect(categoryForEmail({ source: "marketing_campaign", category: "client" }, "x")).toBe("client");
  });

  it("ignores an explicit category outside the list", () => {
    expect(categoryForEmail({ source: "team-fast-goals", category: "misc" }, "x")).toBe("goals");
  });

  it("maps a known source", () => {
    expect(categoryForEmail({ source: "coaching-cycle" }, "x")).toBe("one_on_one");
    expect(categoryForEmail({ source: "team_self_serve_link" }, "x")).toBe("account");
  });

  it("reads a system email's kind, then its subject", () => {
    expect(categoryForEmail({ source: "system", kind: "board-digest" }, "x")).toBe("workboard");
    expect(categoryForEmail(undefined, "Time off request from Minh")).toBe("people_ops");
    expect(categoryForEmail({}, "Mid-year check-in: your self-assessment")).toBe("reviews");
  });

  it("calls anything unmatched other", () => {
    expect(categoryForEmail({ source: "brand-new-sender" }, "x")).toBe("other");
    expect(categoryForEmail(undefined, "Innovation weekly")).toBe("other");
  });
});
