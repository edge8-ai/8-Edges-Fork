import { describe, expect, it } from "vitest";
import { submitterName, type IdeaRow } from "./idea-shared";

// The admin backlog names each idea's submitter to staff: the display name,
// the email for someone with no name (as the old chain did), and "—" for an
// idea whose submitter is gone (S.16.10 review).
const row = (people: IdeaRow["people"]) => ({ people }) as IdeaRow;

describe("submitterName", () => {
  it("is the display name", () => {
    expect(submitterName(row({ display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu", email: "h@x.test" }))).toBe("Hiếu Nguyễn");
  });

  it("is the email for a submitter with no name", () => {
    expect(submitterName(row({ display_name: null, preferred_name: null, full_name: null, email: "h@x.test" }))).toBe("h@x.test");
  });

  it("is \"—\" when the submitter is missing", () => {
    expect(submitterName(row(null))).toBe("—");
  });
});
