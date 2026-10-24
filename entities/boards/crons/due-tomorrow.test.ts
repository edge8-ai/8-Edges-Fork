import { describe, expect, it } from "vitest";
import { dueWindow } from "./due-tomorrow";

// TH.2: the morning run tells each assignee what is due by the next working day.
describe("dueWindow", () => {
  it("is the next day on a working day", () => {
    expect(dueWindow("2026-10-13")).toEqual({ after: "2026-10-13", through: "2026-10-14" });
  });

  it("reaches through the weekend to Monday on a Friday", () => {
    expect(dueWindow("2026-10-09")).toEqual({ after: "2026-10-09", through: "2026-10-12" });
  });
});
