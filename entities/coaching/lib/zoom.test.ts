import { describe, expect, it } from "vitest";
import { distinctAttendees, meetingPath, speakersFromText, vttToText, zoomSummaryMarkdown } from "./zoom";

// The VTT cleanup and speaker detection are what decide which participant rows
// the ingest writes. Ported from scripts/crm/zoom.mjs, whose behaviour the two
// sessions already in company_os were written with.

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Alex Coach: Welcome back everyone.

2
00:00:04.500 --> 00:00:09.000
Minh Tran: Thanks. The plan is: ship the seam first.

3
00:00:09.500 --> 00:00:12.000
Alex Coach: Agreed.

4
00:00:12.500 --> 00:00:15.000
Minh Tran: I will open the PR today.
`;

describe("vttToText", () => {
  it("keeps the spoken lines and drops the header, indices and timestamps", () => {
    expect(vttToText(VTT)).toBe(
      ["Alex Coach: Welcome back everyone.", "Minh Tran: Thanks. The plan is: ship the seam first.", "Alex Coach: Agreed.", "Minh Tran: I will open the PR today."].join("\n"),
    );
  });
});

describe("speakersFromText", () => {
  it("names a speaker only when a name-shaped label opens two or more lines", () => {
    expect(speakersFromText(vttToText(VTT))).toEqual(["Alex Coach", "Minh Tran"]);
  });

  it("ignores mid-sentence colons and one-off labels", () => {
    const text = ["Dana Pham: the plan is: ship it", "Dana Pham: yes", "Note to self: buy milk", "Note to self: again"].join("\n");
    // "Note to self" fails the capitalised-words shape even though it repeats.
    expect(speakersFromText(text)).toEqual(["Dana Pham"]);
  });
});

describe("distinctAttendees", () => {
  it("lists each person once, in join order, merging rejoins on email or name", () => {
    expect(
      distinctAttendees([
        { name: "Alex Coach", user_email: "alex@example.test" },
        { name: "Minh" },
        { name: "Minh" },
        { name: "Alex C", user_email: "Alex@example.test" },
        { name: "  Dana   Pham " },
        { name: "" },
      ]),
    ).toEqual(["Alex Coach", "Minh", "Dana Pham"]);
  });
});

describe("meetingPath", () => {
  it("encodes a UUID once, and twice when it starts with a slash or contains a double slash", () => {
    expect(meetingPath("ud+OYBtWRHWWvGQsL7D6Dw==")).toBe("ud%2BOYBtWRHWWvGQsL7D6Dw%3D%3D");
    expect(meetingPath("/abc==")).toBe("%252Fabc%253D%253D");
    expect(meetingPath("a//b")).toBe("a%252F%252Fb");
  });
});

describe("zoomSummaryMarkdown", () => {
  it("writes the overview as the TL;DR, each section under its label, and the next steps as a list", () => {
    expect(
      zoomSummaryMarkdown({
        title: "Access",
        overview: "The group covered access.",
        details: [{ label: "Paid plans", summary: "Confirm the tier first." }],
        nextSteps: ["Ask IT.", "Write the plan."],
        createdAt: "2026-10-29T04:35:09Z",
      }),
    ).toBe("## TL;DR\nThe group covered access.\n\n## Paid plans\nConfirm the tier first.\n\n## Next steps\n- Ask IT.\n- Write the plan.");
  });

  it("leaves out what Zoom did not write", () => {
    expect(zoomSummaryMarkdown({ title: "", overview: "Short call.", details: [], nextSteps: [], createdAt: null })).toBe("## TL;DR\nShort call.");
  });
});
