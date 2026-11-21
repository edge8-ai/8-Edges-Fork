import { describe, expect, it } from "vitest";
import { cuesToLines, looksLikeCues, parseTranscript } from "./transcript-parse";

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
<v Hoan Ngo>Let's start with the stand-up.

2
00:00:03.500 --> 00:00:06.000
<v Hoan Ngo>Đức, what are you on?

3
00:00:06.500 --> 00:00:09.000
<v Nguyễn Văn Đức>I am on the <i>payment</i> page.
`;

const SRT = `1
00:00:01,000 --> 00:00:03,000
Hoan Ngo: Let's start.

2
00:00:03,500 --> 00:00:06,000
Lê Vinh: Okay.
`;

describe("parseTranscript", () => {
  it("turns WebVTT voice cues into Name: text lines, joining one speaker's consecutive cues and dropping tags", () => {
    expect(looksLikeCues(VTT)).toBe(true);
    expect(cuesToLines(VTT)).toBe("Hoan Ngo: Let's start with the stand-up. Đức, what are you on?\nNguyễn Văn Đức: I am on the payment page.");
  });

  it("reads SubRip by its file name or its timing lines", () => {
    expect(parseTranscript(SRT, "class.srt")).toBe("Hoan Ngo: Let's start.\nLê Vinh: Okay.");
    expect(parseTranscript(SRT)).toBe("Hoan Ngo: Let's start.\nLê Vinh: Okay.");
  });

  it("leaves a plain Lark export as it is, trimmed and without runs of blank lines", () => {
    expect(parseTranscript("Hoan Ngo: hello\r\n\n\n\nLê Vinh: hi\n")).toBe("Hoan Ngo: hello\n\nLê Vinh: hi");
  });
});
