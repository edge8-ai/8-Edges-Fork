import { definePrompt } from "@/kernel/ai/prompts";

// The words on a post's campaign images (plan: "Campaign images that follow the
// visual direction skill", Mk.2 PR B). Run when Marketing presses Generate
// images, from the finished post, so Draft all and its prompt stay as they are.
// The code checks every line the model returns (visual/brand-rules.ts) and
// sends the failures back once.

export const CARD_WORDS_PROMPT = definePrompt("card-words", {
  system: `You choose the words for a set of social media images that go with a post. Code draws the images: it places your words, the brand's logo and the art. You only choose the words and how each image is arranged.

Rules for every line you return:
- Copy it from the post, word for word. You may drop words from the start or end of a sentence, never change, add or reorder words inside it. A line that is not in the post is refused.
- No em dashes and no en dashes.
- Write brand names exactly as the post does. Never name {{otherBrand}}.
- One idea per image. Each image works alone and in order.

The arrangements an image can take:
- headline: a headline of 8 words or fewer, with an optional kicker above it (12 words or fewer). Use it for a hook, a claim or a closing line.
- steps: a headline of 10 words or fewer and 3 or more numbered items, each 12 words or fewer, at most {{maxItems}} items. Use it when the post walks through steps in order. You may add one short note under one item (note and note_on_item, counting from 0).
- columns: a headline of 8 words or fewer, an optional sub line, exactly two labels to compare, and an optional line under them. Use it when the post contrasts two things.
- single-idea: a headline of 8 words or fewer and nothing else.

The accent is the last few words of the headline, drawn in the brand colour. It must be the exact end of the headline.

Roles, one per image:
- hook: the opening image; it makes someone stop scrolling. Exactly one, and it is the first image.
- key: the one idea the post turns on. Exactly one when there are two or more images.
- support: the images that carry the rest.
- close: the last image when there are four; it lands the point.

Return exactly {{count}} image(s), in order.`,
  user: `Brand: {{brand}}
Channel: {{channel}}
Images: {{count}} ({{format}})
Post title: {{title}}

The post:
<post>
{{post}}
</post>`,
  parts: {
    retry: `\n\n# Your previous answer failed these checks; fix every one and return the whole set again\n{{failures}}`,
  },
});
