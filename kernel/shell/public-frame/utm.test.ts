import { describe, expect, it } from "vitest";
import { utmFromSearch } from "./utm";

// The campaign a visitor arrived through, as the site forms will send it back.
describe("utmFromSearch", () => {
  it("returns the campaign and the optional companions, lowercased and bounded", () => {
    expect(utmFromSearch("?utm_source=letter&utm_medium=email&utm_campaign=Autumn-Letter&utm_content=cta")).toEqual({ campaign: "autumn-letter", source: "letter", medium: "email", content: "cta" });
    expect(utmFromSearch("utm_campaign=x")).toEqual({ campaign: "x", source: undefined, medium: undefined, content: undefined });
  });
  it("is null without a campaign, so nothing is remembered", () => {
    expect(utmFromSearch("?utm_source=letter")).toBeNull();
    expect(utmFromSearch("")).toBeNull();
  });
});
