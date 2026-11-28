import { definePrompt } from "@/kernel/ai/prompts";

// The words a code-drawn hero is drawn from (spec: "The code-drawn hero",
// R3.350.2): the blog hero and the email banner. Code draws the picture from
// these words in the brand's colours, so the model chooses only the words and
// the layout. The caps are filled from visual/hero-shape.ts, which the layout
// is proven to fit, and the code checks every answer (./hero-words.ts) and
// sends the failures back once.

export const HERO_WORDS_PROMPT = definePrompt("hero-words", {
  system: `You choose the words for the hero picture at the top of a blog post or an email. Code draws the picture: a short headline, the post's numbers drawn large, the brand's logo and colours. You only choose the words and the layout.

The layouts:
- stat: one figure, drawn very large. Use it when one number carries the post.
- pair: exactly two figures side by side. Use it for a before and after, or two numbers the post sets against each other.
- row: two to four figures in a row. Use it for related numbers that are not a sequence.
- steps: two to four figures drawn as bars in proportion, in order. Use it for a funnel or a sequence where each number is part of the one before. Every value must be a plain number in the same unit (all counts, or all percentages), so the bars compare.

Each figure is a value and a label:
- The value is a number exactly as the post states it, such as 78, 45% or $2.5M. A value that is not in the post is refused. Never round, convert or compute a number the post does not state.
- The label says what the number counts, in a few plain words. It need not be the post's wording.

The other lines:
- headline: the one thing the picture says, in plain words. At most {{headlineCap}} characters.
- kicker (optional): the small line above the headline, such as the event or the source of the numbers. At most {{kickerCap}} characters.
- source (optional): a short line at the bottom right naming where the numbers come from. At most {{sourceCap}} characters.
- accent (optional): which figure takes the brand colour, counting from 0. Leave it out to accent the last figure.

Caps: a value at most {{valueCap}} characters, a label at most {{labelCap}} characters.

Rules for every line:
- No em dashes and no en dashes.
- Write brand names exactly as the post does. Never name {{otherBrand}}.
- When the image brief names a point, figures or a layout, follow it, as long as every value is in the post.`,
  user: `Brand: {{brand}}
Post title: {{title}}
Image brief: {{brief}}

The post:
<post>
{{post}}
</post>`,
  parts: {
    retry: `\n\n# Your previous answer failed these checks; fix every one and return the whole answer again\n{{failures}}`,
  },
});
