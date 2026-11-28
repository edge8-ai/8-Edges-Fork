import { describe, expect, it } from "vitest";

import { matchExistingAssets } from "./campaign-asset-match";

const row = (id: string, channel: string, title: string | null) => ({ id, channel, title });
const out = (channel: string, title?: string) => ({ channel, title });

// The six assets the 18 Nov test campaign drafted, oldest first.
const existing = [
  row("blog", "blog", "One shared database beats ten AI tools"),
  row("li-p", "linkedin", "Personal LinkedIn: tools first is backwards"),
  row("li-c", "linkedin", "Company LinkedIn: blog summary"),
  row("fb-p", "facebook", "Personal Facebook: the eleven places question"),
  row("fb-c", "facebook", "Company Facebook: blog summary"),
  row("x", "twitter", "Twitter thread: seats first, data last"),
];
const ids = (m: ({ id: string } | null)[]) => m.map((r) => r?.id ?? null);

describe("matchExistingAssets", () => {
  it("gives each of two posts on a channel its own row on a re-draft", () => {
    const outputs = [
      out("blog", "A new title"),
      out("linkedin", "Personal LinkedIn: a new angle"),
      out("linkedin", "Company LinkedIn: blog summary, again"),
      out("facebook", "Personal Facebook: new"),
      out("facebook", "Company Facebook: new"),
      out("twitter", "Twitter thread: new"),
    ];
    expect(ids(matchExistingAssets(existing, outputs))).toEqual(["blog", "li-p", "li-c", "fb-p", "fb-c", "x"]);
  });

  it("keeps Personal on the Personal row when the writer returns them in the other order", () => {
    const outputs = [out("linkedin", "Company LinkedIn: summary"), out("linkedin", "Personal LinkedIn: story")];
    expect(ids(matchExistingAssets(existing, outputs))).toEqual(["li-c", "li-p"]);
  });

  it("pairs unlabelled outputs with the remaining rows, oldest first", () => {
    const outputs = [out("linkedin", "Something new"), out("linkedin", "Personal LinkedIn: story")];
    expect(ids(matchExistingAssets(existing, outputs))).toEqual(["li-c", "li-p"]);
    expect(ids(matchExistingAssets(existing, [out("facebook"), out("facebook")]))).toEqual(["fb-p", "fb-c"]);
  });

  it("never uses a row twice; an extra output is a new asset", () => {
    const outputs = [out("twitter", "Twitter thread: one"), out("twitter", "Twitter thread: two")];
    expect(ids(matchExistingAssets(existing, outputs))).toEqual(["x", null]);
  });

  it("makes everything new on a campaign with no assets", () => {
    expect(ids(matchExistingAssets([], [out("blog", "A"), out("linkedin", "B")]))).toEqual([null, null]);
  });
});
