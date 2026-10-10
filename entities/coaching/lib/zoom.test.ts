import { describe, expect, it } from "vitest";
import { speakersFromText, vttToText } from "./zoom";

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
