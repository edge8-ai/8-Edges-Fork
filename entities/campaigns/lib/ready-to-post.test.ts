import { describe, expect, it } from "vitest";
import { postedByHand, readyToPostBundle, readyToPostMessage, type ReadyToPostImage } from "./ready-to-post";

// Ready to post (spec: "Marketing images and publishing", seam 4). The
// expected bundles and file names below are written out by hand from the spec
// and the approved prototype, so a change to the helper has to change them.

const title = "Personal LinkedIn: myth vs reality on why ideas die";
const base = "personal-linkedin-myth-vs-reality-on-why-ideas-die";

// A selected version as the image library holds it: a code-drawn set's card.
function set(count: 1 | 2 | 4, pdfUrl: string | null = null): ReadyToPostImage {
  return {
    url: "https://cdn.test/s/slide-1.png",
    card: {
      kind: "set",
      brand: "edge8",
      channel: "linkedin",
      style: "signature",
      count,
      format: count === 1 ? "single" : "carousel-slide",
      width: 1080,
      height: 1350,
      chosenAt: "brand",
      logo: "brand kit",
      art: "code",
      slides: Array.from({ length: count }, (_, i) => ({
        url: `https://cdn.test/s/slide-${i + 1}.png`,
        role: "key" as const,
        arrangement: "headline" as const,
        why: "",
        words: { headline: "Why ideas die" },
      })),
      pdfUrl,
    },
  };
}

describe("the bundle a post downloads", () => {
  it("is the carousel PDF for a LinkedIn set of two or more", () => {
    expect(readyToPostBundle({ title, channel: "linkedin" }, set(4, "https://cdn.test/s/carousel.pdf"))).toEqual({
      kind: "pdf",
      fileName: `${base}.pdf`,
      url: "https://cdn.test/s/carousel.pdf",
      slides: 4,
    });
    expect(readyToPostBundle({ title, channel: "linkedin" }, set(2, "https://cdn.test/s/carousel.pdf"))).toMatchObject({ kind: "pdf", slides: 2 });
  });

  it("is a zip of the PNGs for a Facebook set, each named after the post", () => {
    expect(readyToPostBundle({ title: "Why ideas die", channel: "facebook" }, set(4))).toEqual({
      kind: "zip",
      fileName: "facebook-why-ideas-die.zip",
      files: [1, 2, 3, 4].map((n) => ({ name: `facebook-why-ideas-die-${n}.png`, url: `https://cdn.test/s/slide-${n}.png` })),
    });
    expect(readyToPostBundle({ title: "Why ideas die", channel: "facebook" }, set(2))).toMatchObject({ kind: "zip", fileName: "facebook-why-ideas-die.zip" });
  });

  it("is a zip for a LinkedIn set made before sets carried their PDF", () => {
    expect(readyToPostBundle({ title, channel: "linkedin" }, set(4, null))).toMatchObject({ kind: "zip", fileName: `${base}.zip` });
  });

  it("is one PNG for a set of one, on any channel", () => {
    expect(readyToPostBundle({ title: "Why ideas die", channel: "twitter" }, set(1))).toEqual({
      kind: "image",
      fileName: "x-why-ideas-die.png",
      url: "https://cdn.test/s/slide-1.png",
    });
    expect(readyToPostBundle({ title, channel: "linkedin" }, set(1))).toMatchObject({ kind: "image", fileName: `${base}.png` });
  });

  it("is the one image a post had before sets, keeping its own file type", () => {
    expect(readyToPostBundle({ title: "Why ideas die", channel: "facebook" }, { url: "https://cdn.test/e/hero.jpg?v=2", card: null })).toEqual({
      kind: "image",
      fileName: "facebook-why-ideas-die.jpg",
      url: "https://cdn.test/e/hero.jpg?v=2",
    });
  });

  it("is the one picture of a code-drawn hero", () => {
    const hero: ReadyToPostImage = {
      url: "https://cdn.test/e/hero/1.png",
      card: {
        kind: "hero",
        brand: "edge8",
        channel: "email",
        width: 1200,
        height: 675,
        logo: "brand kit",
        art: "code",
        words: { layout: "stat", headline: "Why ideas die", figures: [{ value: "3", label: "built a prototype" }] },
      },
    };
    expect(readyToPostBundle({ title: "Why ideas die", channel: "facebook" }, hero)).toEqual({
      kind: "image",
      fileName: "facebook-why-ideas-die.png",
      url: "https://cdn.test/e/hero/1.png",
    });
  });

  it("is nothing when the post has no images yet", () => {
    expect(readyToPostBundle({ title, channel: "linkedin" }, null)).toEqual({ kind: "none" });
  });

  it("names a post with no usable title after its channel", () => {
    expect(readyToPostBundle({ title: "  ???  ", channel: "twitter" }, set(1))).toMatchObject({ fileName: "x-post.png" });
  });
});

describe("what Ready to post tells the marketer", () => {
  it("says what downloads and what to do with it, as in the prototype", () => {
    const pdf = readyToPostBundle({ title, channel: "linkedin" }, set(4, "https://cdn.test/s/carousel.pdf"));
    expect(readyToPostMessage(pdf, { channel: "linkedin", copied: true, markPostedHere: true, makeLabel: "Make images" })).toEqual({
      tone: "ok",
      text: `Text copied. Downloading ${base}.pdf (4 slides). Paste the text into LinkedIn, add the PDF as a document, then press Mark posted.`,
    });
  });

  it("names the images in a zip and the one image of an X post", () => {
    const zip = readyToPostBundle({ title: "Why ideas die", channel: "facebook" }, set(2));
    expect(readyToPostMessage(zip, { channel: "facebook", copied: true, markPostedHere: true, makeLabel: "Make images" }).text).toBe(
      "Text copied. Downloading facebook-why-ideas-die.zip (2 images). Paste the text into Facebook, add the images, then press Mark posted.",
    );
    const png = readyToPostBundle({ title: "Why ideas die", channel: "twitter" }, set(1));
    expect(readyToPostMessage(png, { channel: "twitter", copied: true, markPostedHere: true, makeLabel: "Make images" }).text).toBe(
      "Text copied. Downloading x-why-ideas-die.png. Paste the text into X, add the image, then press Mark posted.",
    );
  });

  it("asks for images first when there are none, naming the button on that screen", () => {
    expect(readyToPostMessage({ kind: "none" }, { channel: "linkedin", copied: false, markPostedHere: true, makeLabel: "Make images" })).toEqual({
      tone: "warn",
      text: "This post has no images yet. Press Make images first, then Ready to post.",
    });
    expect(readyToPostMessage({ kind: "none" }, { channel: "linkedin", copied: false, markPostedHere: false, makeLabel: "Generate images" }).text).toBe(
      "This post has no images yet. Press Generate images first, then Ready to post.",
    );
  });

  it("says when the text could not be copied, and where to mark it posted off the calendar", () => {
    const png = readyToPostBundle({ title: "Why ideas die", channel: "twitter" }, set(1));
    expect(readyToPostMessage(png, { channel: "twitter", copied: false, markPostedHere: false, makeLabel: "Generate images" }).text).toBe(
      "The text could not be copied: select it and copy it by hand. Downloading x-why-ideas-die.png. Paste the text into X, add the image, then mark it posted on the calendar.",
    );
  });
});

// Social posts never publish themselves: they go from approved to published
// by hand, so approved and scheduled ones say so (R3.346.3).
describe("which posts say Post by hand", () => {
  it.each<[string, string, boolean]>([
    ["linkedin", "approved", true],
    ["linkedin", "scheduled", true],
    ["facebook", "approved", true],
    ["twitter", "scheduled", true],
    ["linkedin", "idea", false],
    ["linkedin", "drafted", false],
    ["linkedin", "published", false],
    ["facebook", "skipped", false],
    ["blog", "approved", false],
    ["blog", "scheduled", false],
    ["email", "scheduled", false],
  ])("a %s post that is %s: %s", (channel, status, expected) => {
    expect(postedByHand({ channel, status })).toBe(expected);
  });
});
