import { describe, expect, it } from "vitest";
import {
  auditLinkError,
  bannedLanguageError,
  boldDataPoints,
  brandNameError,
  emDashError,
  exhibitNumbers,
  exhibitNumbersError,
  faqDataError,
  faqError,
  figuresIn,
  internalPostLinks,
  isInternalUrl,
  qualityErrors,
  readerText,
  wordCount,
  wordRangeError,
} from "./checks";

const faq = (first: string) =>
  [first, "What next?", "Why now?", "How much?", "Who does it?"]
    .map((q) => `<details class="faq-item">\n<summary>${q}</summary>\n\nAn answer.\n</details>`)
    .join("\n\n");

describe("word count", () => {
  it("counts prose only, above the FAQ, without figures or markup", () => {
    const md = `One two three.\n\n<figure class="post-figure">\n\n![alt text here](https://x/y.png)\n\n<figcaption>Exhibit words</figcaption>\n</figure>\n\n## FAQ\n\nfour five six`;
    expect(wordCount(md)).toBe(3);
  });
  it("names both ends of the brand range", () => {
    expect(wordRangeError("a b c", { min: 5, max: 9 })).toMatch(/3 words; the brand profile asks for 5 to 9/);
    expect(wordRangeError("a b c d e f", { min: 5, max: 9 })).toBeNull();
  });
});

describe("reader text", () => {
  it("keeps a source anchor's text joined to the punctuation around it", () => {
    // The links step wraps a phrase in an anchor and then requires the reader
    // text to be unchanged; a phrase next to a quote or comma used to fail.
    const plain = 'The Lab published "The Enterprise AI Playbook" (Pereira), a study.';
    const linked = 'The Lab published "<a href="https://x" target="_blank" rel="noopener">The Enterprise AI Playbook</a>" (Pereira), a study.';
    expect(readerText(linked)).toBe(readerText(plain));
    expect(readerText("[the same phrase](/post/x/), then")).toBe("the same phrase, then");
  });
});

describe("house rules", () => {
  it("blocks em dashes", () => {
    expect(emDashError("a — b")).not.toBeNull();
    expect(emDashError("a, b")).toBeNull();
  });
  it("blocks audit, staffing and hiring language but allows hire", () => {
    expect(bannedLanguageError("Book an AI audit today.")).toMatch(/audit/);
    expect(bannedLanguageError("Our staffing team is hiring.")).toMatch(/staffing, hiring/);
    expect(bannedLanguageError("Talk to a recruiter.")).toMatch(/recruiter/);
    expect(bannedLanguageError("Your first AI hire should own the process.")).toBeNull();
  });
  it("blocks the brand name in the wrong casing but leaves the domain alone", () => {
    expect(brandNameError("EDGE8 is here")).not.toBeNull();
    expect(brandNameError("Edge 8 is here")).not.toBeNull();
    expect(brandNameError("edge8 is here")).not.toBeNull();
    expect(brandNameError("Edge8 at edge8.ai and dave@example.com")).toBeNull();
  });
  it("blocks any link to an audit page", () => {
    expect(auditLinkError("see [this](https://www.example.com/ai-audit/)")).toMatch(/audit/);
    expect(auditLinkError('<a href="https://x.com/audit-report">x</a>')).toMatch(/audit/);
    expect(auditLinkError("see [this](/post/other/)")).toBeNull();
  });
  it("knows our own hosts", () => {
    expect(isInternalUrl("/post/x/")).toBe(true);
    expect(isInternalUrl("https://www.example.com/blog/")).toBe(true);
    expect(isInternalUrl("https://every.to/x")).toBe(false);
  });
  it("counts internal post links above the FAQ only", () => {
    expect(internalPostLinks("[a](/post/one/) [b](/post/two)\n## FAQ\n[c](/post/three/)")).toEqual(["one", "two"]);
  });
});

describe("faq", () => {
  it("wants five items, the first a How or What question with the keyword", () => {
    expect(faqError(faq("How to delegate work to AI?"), "delegate work to AI")).toBeNull();
    expect(faqError(faq("Why delegate work to AI?"), "delegate work to AI")).toMatch(/start with How or What/);
    expect(faqError(faq("How to write a brief?"), "delegate work to AI")).toMatch(/carry the primary keyword/);
    expect(faqError(faq("How?").split("</details>").slice(0, 3).join("</details>"), null)).toMatch(/has 3 item/);
  });
  it("reads a figure the post spells out in words as well as in digits", () => {
    expect(figuresIn("A goal tree has four layers and two rules, read by 37% of teams.")).toEqual(["4", "2", "37"]);
    expect(figuresIn("A capable model.")).toEqual([]);
  });
  it("backs an FAQ answer with a number the post states in words", () => {
    const body = "A goal tree has four layers. Six months later the calendar has drifted.";
    expect(faqDataError([{ question: "How?", answer: "It has four layers." }], body)).toBeNull();
    expect(faqDataError([{ question: "How?", answer: "It has 4 layers." }], body)).toBeNull();
    expect(faqDataError([{ question: "How?", answer: "It has layers." }], body)).toMatch(/has no figure/);
    expect(faqDataError([{ question: "How?", answer: "It has nine layers." }], body)).toMatch(/cites 9, which the post never states/);
  });
});

describe("exhibits", () => {
  it("reads numbers from text nodes only", () => {
    const svg = `<svg viewBox="0 0 800 450"><rect x="80" width="120"/><text x="10" y="20">42% of teams</text><text><tspan>1,200 hours</tspan></text></svg>`;
    expect(exhibitNumbers(svg)).toEqual(["42", "1,200"]);
  });
  it("fails a number the body never states", () => {
    const svg = `<svg><text>42%</text><text>7 days</text></svg>`;
    expect(exhibitNumbersError(svg, "Only **42%** finish.", "Exhibit 1")).toMatch(/Exhibit 1 shows 7/);
    expect(exhibitNumbersError(svg, "Only **42%** finish in 7 days.", "Exhibit 1")).toBeNull();
  });
});

describe("qualityErrors", () => {
  const body = `Opening with **3 facts** and **42%** growth.

<div class="idea-in-brief">
<span class="iib-label">Idea in Brief</span>
<div class="iib-item"><span class="iib-head">The Problem</span><span class="iib-body">x</span></div>
</div>

## Section

> A verbatim quote.

<figure class="post-figure">

![a](https://x/1.png)

<figcaption><strong>Exhibit 1.</strong> c <span class="fig-source">Source: s.</span></figcaption>
</figure>

<figure class="post-figure">

![b](https://x/2.png)

<figcaption><strong>Exhibit 2.</strong> c <span class="fig-source">Source: s.</span></figcaption>
</figure>

Prose [one](/post/one/) and [two](/post/two/).

${faq("How to delegate work to AI?")}`;

  it("passes a body that follows the process", () => {
    expect(qualityErrors(body, { primaryKeyword: "delegate work to AI", range: null })).toEqual([]);
  });
  it("names every missing element at once", () => {
    const errors = qualityErrors("Plain text — no process.", { primaryKeyword: null, range: { min: 10, max: 20 } });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/em dash/),
        expect.stringMatching(/4 words/),
        expect.stringMatching(/Idea in Brief/),
        expect.stringMatching(/0 exhibit/),
        expect.stringMatching(/pull quote/),
        expect.stringMatching(/bolded data points/),
        expect.stringMatching(/FAQ has 0/),
      ]),
    );
  });
  it("counts bold data points outside figures and the brief", () => {
    expect(boldDataPoints("**42%** and **no digits** and **3 days**")).toEqual(["42%", "3 days"]);
  });
});
