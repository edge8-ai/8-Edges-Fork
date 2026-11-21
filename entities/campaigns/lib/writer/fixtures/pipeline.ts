import { PALETTE } from "@/kernel/config/palette";

// Fixture inputs and model output for the pipeline test: a brand profile with
// the fields the steps read, a campaign idea with two quotable sources, and
// the structured reply each model step returns. Shaped like the live Edge8
// profile and a real writer reply, sized down so the test stays readable
// (the fixture profile asks for 600 to 1200 words).

export const PROFILE = {
  brandId: "brand-1",
  brandSlug: "edge8",
  brandName: "Edge8",
  positioning: "AI leadership for founders.",
  audience: "Founders and CTOs.",
  offer: "AI programs.",
  primaryCta: "Read the next post.",
  authorMd: "Jordan Ellis",
  voiceMd: "Direct, practical.",
  rulesMd: "- Write \"Edge8\" exactly like that.\n- Never use em dashes.",
  channelsMd: "## Active channels\nBlog, LinkedIn, Facebook, email.\n\n## Blog\n600 to 1200 words. Lead with the business problem.\n\n## LinkedIn\nHook first.",
  processMd: "## Blog production workflow\n1. Develop the idea.\n4. Draft: 600 to 1200 words.",
  blogStylesMd: "thesis",
  editingLensMd: "## Editing lens (Dan Shipper)\n- Is the thinking sharp?",
  seoLensMd: "## SEO lens (Neil Patel)\n- Keyword realism.",
  imageStyleMd: "Edge8 palette, editorial. Navy ground, Blue and Mint accents, Manrope.",
  preferredBlogTypes: ["thesis"],
  preferredImageStyles: ["concept-card"],
  preferredSocialStyles: ["hook-story"],
  autoPublish: false,
};

// The campaign plan, as planCampaign saves it at the top of the SEO/GEO plan.
export const PLAN_MD = `## Plan

**Angle:** Delegating to AI fails on the decisions the business never wrote down.
**Primary question:** How to delegate work to AI: what should you write down first?
**Primary keyword:** delegate work to AI
**Blog type:** thesis
**Hero image style:** concept-card
**LinkedIn style:** hook-story
**Facebook style:** hook-story`;

export const IDEA = `**Thesis:** The speed of the model exposes the flaws in the process. Fable 5.1 will work for a day on a brief.

Sources:
- Every, "Fable 5.1 review" (https://every.to/vibe-check/fable-5-1): "When you have enough information to act, act."
- Anthropic, Fable 5.1 guide (https://docs.anthropic.com/fable): "Only report work you can point to evidence for."

Facts: 42% of pilots stall; the median brief is 7 lines; the model ran 6 hours on one brief; 3 of 4 briefs had no definition of done.`;

const para = (n: number, seed: string) =>
  Array.from({ length: n }, (_, i) => `${seed} sentence ${i + 1} adds one more plain idea to the argument for the reader.`).join(" ");

// About 700 words, with headings the later steps anchor to, bold data points,
// and the numbers the exhibits show.
export const DRAFT_BODY = `A PR agency runs a 90-day plan for every client. We asked the model to build the planning system and it came back with plans that all started on July 1. ${para(4, "Opening")}

## The speed of the model is the point

Fable 5.1 will work for a day on a brief. The model ran **6 hours** on one brief and built on every unstated assumption it found. ${para(6, "Speed")}

## Four things the model needs from you

**42%** of pilots stall, and the median brief is **7 lines** long. Every's review found that **3 of 4** briefs had no definition of done. ${para(6, "Four")}

### Goal, with the reason

${para(5, "Goal")} The goal names the outcome and the reason behind it.

### Guardrails

${para(5, "Guardrail")} Guardrails are the lines the model must not cross.

### Definition of done

${para(5, "Done")} A definition of done is the evidence that proves the work.

### Budget

${para(5, "Budget")} A budget covers time, money, effort and autonomy.

## The Other 50%

${para(6, "Other")} Delegating to a model is the other half of leadership.

## Try it on one process

Pick one process your company runs every week and write the four things down. ${para(5, "Try")}`;

export const EDITED_BODY = DRAFT_BODY.replace("## The Other 50%", "## The Other 50% of leadership");

export const WRITER_OUTPUTS = [
  { channel: "blog", title: "The Smarter the Model, the More the Job Is Yours", bodyMd: DRAFT_BODY, blogStyle: "thesis", imageStyle: "concept-card", seoMd: "**Title tag (58 chars):** wrong label", imageBriefMd: "Two timelines over a desk calendar." },
  { channel: "linkedin", title: "LinkedIn", bodyMd: "Hook.\n\nLine.", socialStyle: "hook-story", imageStyle: "concept-card", imageBriefMd: "Brief." },
  { channel: "facebook", title: "Facebook", bodyMd: "Para one.\n\nPara two. [Link in first comment]", socialStyle: "hook-story", imageStyle: "concept-card", imageBriefMd: "Brief." },
  { channel: "email", title: "Email", subject: "Subject", preheader: "Pre", bodyMd: "Body.", imageStyle: "concept-card", imageBriefMd: "Brief." },
];

export const EDIT_REPLY = { body_md: EDITED_BODY, change_log: ["Renamed the Other 50% heading to say what it is.", "Kept the opening; it does real work."] };

export const SEO_REPLY = {
  title: "The Smarter the Model, the More the Job Is Yours",
  title_tag: "How to Delegate Work to AI: Four Things to Write First",
  meta_description: "Delegate work to AI without shipping your unstated assumptions: goal, guardrails, definition of done, budget.",
  slug: "how-to-delegate-work-to-ai",
  primary_keyword: "delegate work to AI",
  secondary_keywords: ["definition of done", "AI guardrails"],
  excerpt: "The model did not fail; the process was never finished.",
  category: "Innovation",
  faq: [
    { question: "How to delegate work to AI: what should you write down first?", answer: "Four things: goal, guardrails, definition of done, budget; 3 of 4 briefs had no definition of done." },
    { question: "What is Claude Fable 5.1, for a business leader?", answer: "A model that ran 6 hours on one brief." },
    { question: "Why did 42% of pilots stall?", answer: "The brief was 7 lines and had no definition of done." },
    { question: "What is the Other 50% of leadership?", answer: "Delegating to a model, which 42% of pilots stall on." },
    { question: "How much should you budget for an AI agent task?", answer: "Time, money, effort and autonomy, stated before you start; the model ran 6 hours on one brief." },
  ],
};

const svg = (text: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><marker id="arrow" markerWidth="10" markerHeight="10"><path d="M0,0 L10,5 L0,10" fill="${PALETTE.white}"/></marker></defs><rect width="1600" height="900" fill="${PALETTE.dark}"/><line x1="80" y1="200" x2="400" y2="200" stroke="${PALETTE.white}" marker-end="url(#arrow)"/><text x="80" y="120" font-family="Manrope" font-size="48" fill="${PALETTE.white}">${text}</text></svg>`;

export const EXHIBITS_REPLY = {
  exhibits: [
    { svg: svg("42% of pilots stall"), alt: "Bar showing 42% of pilots stall", caption: "Pilots that stall against those that ship.", source: "Every, Fable 5.1 review", anchor_heading: "Four things the model needs from you" },
    { svg: svg("7 lines, 6 hours"), alt: "The median brief against the run time", caption: "A 7 line brief and a 6 hour run.", source: "Edge8 analysis", anchor_heading: "The speed of the model is the point" },
  ],
};

// The brand's ledger: three published posts, newest first, each with the
// choices its run made. The links step links to them; the draft, SEO and
// channels steps choose against them.
export type Ledger = {
  campaignId: string; campaignName: string; brandId: string | null; brandName: string | null; date: string | null; status: string;
  blogStatus: string | null; slug: string | null; postedUrl: string | null; title: string | null; primaryKeyword: string | null;
  primaryQuestion: string | null; blogType: string | null; imageStyle: string | null;
  social: { channel: string; socialStyle: string | null; imageStyle: string | null }[];
};
const post = (n: number, slug: string, title: string, date: string, keyword: string, blogType: string, imageStyle: string, socialStyle: string): Ledger => ({
  campaignId: `camp-${n}`, campaignName: title, brandId: "brand-1", brandName: "Edge8", date, status: "done", blogStatus: "published",
  slug, postedUrl: `https://www.example.com/post/${slug}/`, title, primaryKeyword: keyword, primaryQuestion: `What is ${keyword}?`,
  blogType, imageStyle,
  social: [{ channel: "linkedin", socialStyle, imageStyle }, { channel: "facebook", socialStyle: "story-time", imageStyle }],
});
export const LEDGER: Ledger[] = [
  post(12, "the-other-50-percent-of-leadership", "The other 50 percent", "2026-08-20", "AI leadership", "contrarian", "editorial-illustration", "hot-take"),
  post(11, "your-prompts-are-expiring", "Your prompts are expiring", "2026-08-10", "prompt maintenance", "warning", "concept-card", "lesson-learned"),
  post(10, "three-levels-of-model-usage", "Three levels of model usage", "2026-08-01", "AI model usage levels", "framework", "data-diagram", "framework-drop"),
];

export const LINKS_REPLY = {
  internal: [
    { phrase: "planning system", slug: "three-levels-of-model-usage" },
    { phrase: "the other half of leadership", slug: "the-other-50-percent-of-leadership" },
    { phrase: "not in the body at all", slug: "your-prompts-are-expiring" },
  ],
  sources: [{ phrase: "Every's review", url: "https://every.to/vibe-check/fable-5-1" }],
};

export const ASSEMBLE_REPLY = {
  idea_in_brief: { problem: "Models build on unstated assumptions.", insight: "The model did not fail; the process was never finished.", way_forward: "Write four things before the brief." },
  pull_quotes: [
    { quote: "When you have enough information to act, act.", anchor_heading: "Guardrails" },
    { quote: "This sentence is paraphrased and not in the idea.", anchor_heading: "Budget" },
  ],
};

export const CHANNELS_REPLY = {
  outputs: [
    { channel: "linkedin", title: "LinkedIn: the finish line", body_md: "The model stopped where it was plausible.\n\nRead the post.", social_style: "hook-story", image_style: "concept-card", image_brief_md: "A finish line drawn in the wrong place." },
    { channel: "facebook", title: "Facebook: July 1", body_md: "Every plan started on July 1.\n\n[Link in first comment]", social_style: "hook-story", image_style: "concept-card", image_brief_md: "A calendar with July 1 circled." },
    { channel: "email", title: "Email: five lines", subject: "The five lines you skipped", preheader: "Before the brief goes out", body_md: "Founder to founder: write the definition of done first.", image_style: "concept-card", image_brief_md: "Five lines on a page." },
  ],
};
