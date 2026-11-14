import { entryCopyOutput as entryCopyOutput_entry_copy } from "./ai/entry-copy";
import { brandWriterOutput as brandWriterOutput_brand_writer } from "./ai/brand-writer";
import { campaignPlanOutput as campaignPlanOutput_campaign_plan } from "./ai/campaign-plan";
import { campaignSeoOutput as campaignSeoOutput_campaign_seo } from "./ai/campaign-seo";
import { marketingRecapOutput as marketingRecapOutput_marketing_recap } from "./ai/marketing-recap";
import { assembleOutput as assembleOutput_step_assemble } from "./writer/step-assemble";
import { channelsOutput as channelsOutput_step_channels } from "./writer/step-channels";
import { editOutput as editOutput_step_edit } from "./writer/step-edit";
import { exhibitsOutput as exhibitsOutput_step_exhibits } from "./writer/step-exhibits";
import { letterGatherOutput as letterGatherOutput_step_gather } from "./letter/step-gather";
import { linksOutput as linksOutput_step_links } from "./writer/step-links";
import { seoOutput as seoOutput_step_seo } from "./writer/step-seo";
import { letterWriteOutput as letterWriteOutput_step_write } from "./letter/step-write";

import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { canonicalSchema } from "@/kernel/ai/testing/schema-equivalence";

// The json_schema each of campaigns's model calls sent until A.4, kept verbatim
// so the schema derived from the Zod that replaced it can be proved equal.
//
// Transcription is the risk this whole card is about: a slip yields a schema
// that is valid but wrong, which no golden snapshot can catch, because a
// snapshot pins what the Zod emits and not that the Zod says what was there
// before. `canonicalSchema` normalises the two spelling differences it knows
// about (the nullable form, and `required` order) and nothing else.
//
// Delete a fixture when "what it used to be" stops being the question. Not
// before.

const BEFORE_0 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "outputs"
  ],
  "properties": {
    "outputs": {
      "type": "array",
      "description": "One entry per deliverable the brand's content rules call for. Produce exactly the channels the rules specify, no more.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "channel",
          "body_md"
        ],
        "properties": {
          "channel": {
            "type": "string",
            "enum": [
              "email",
              "linkedin",
              "facebook",
              "twitter",
              "blog"
            ]
          },
          "title": {
            "type": "string",
            "description": "Short internal label for this deliverable."
          },
          "subject": {
            "type": "string",
            "description": "Email subject line. Email channel only."
          },
          "preheader": {
            "type": "string",
            "description": "Email preheader. Email channel only."
          },
          "body_md": {
            "type": "string",
            "description": "The copy in Markdown (headings, bold, lists, links). For email, exclude the unsubscribe footer; it is added automatically."
          },
          "blog_style": {
            "type": "string",
            "description": "Blog only: a slug from the brand's preferred blog types."
          },
          "social_style": {
            "type": "string",
            "description": "LinkedIn/Facebook/Twitter only: a slug from the brand's preferred social styles."
          },
          "image_style": {
            "type": "string",
            "description": "A slug from the brand's preferred image styles that fits this piece."
          },
          "seo_md": {
            "type": "string",
            "description": "Blog only: the SEO package (title tag, meta description, slug, primary and secondary keywords, five link ideas) run through the SEO lens."
          },
          "image_brief_md": {
            "type": "string",
            "description": "A short image brief: hero concept, palette, and ratios, following the brand's image style. Where the style carries words (a typographic splash, a data diagram, a concept card), give the exact headline or figure and label to set, a handful of words, spelled out in quotes."
          }
        }
      }
    }
  }
} as const;

const BEFORE_1 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "question",
    "keyword",
    "angle",
    "blog_type",
    "hero_image_style",
    "social"
  ],
  "properties": {
    "question": {
      "type": "string",
      "description": "The one question a founder or manager would type into ChatGPT or Google about their own problem, in their own words, that this campaign answers best with a figure from the idea. Starts with How or What. Never names the brand, never asks what a report or post says."
    },
    "keyword": {
      "type": "string",
      "description": "The phrase a person would search, taken from inside the question exactly as written there. Not a sentence."
    },
    "angle": {
      "type": "string",
      "description": "One plain sentence: what this campaign argues and for whom."
    },
    "blog_type": {
      "type": "string",
      "description": "A slug from the brand's preferred blog types that fits the shape of the idea."
    },
    "hero_image_style": {
      "type": "string",
      "description": "A slug from the brand's preferred image styles for the blog hero."
    },
    "social": {
      "type": "array",
      "description": "One entry per active social channel.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "channel",
          "style"
        ],
        "properties": {
          "channel": {
            "type": "string",
            "enum": [
              "linkedin",
              "facebook",
              "twitter"
            ]
          },
          "style": {
            "type": "string",
            "description": "A slug from the brand's preferred social styles that fits this channel and this idea."
          }
        }
      }
    }
  }
} as const;

const BEFORE_2 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "seo_geo_md"
  ],
  "properties": {
    "seo_geo_md": {
      "type": "string",
      "description": "The full plan in Markdown with exactly these H2 sections in order: '## Search (SEO)', '## FAQ', '## GEO (generative engines)'. Search: primary keyword, 3-5 secondary keywords, title tag (<=60 chars), meta description (<=155 chars), URL slug, and 3-5 internal link targets. FAQ: 4-6 real questions a searcher types, each with a 1-2 sentence answer, written to win featured snippets and People Also Ask. GEO: the citable facts (named entities, 2-3 concrete statistics WITH their source, a one-sentence definition an LLM can quote verbatim) and 3-4 natural-language question phrasings people ask an AI assistant on this topic. Never invent statistics; if none are in the source, say what data to gather instead."
    }
  }
} as const;

const BEFORE_3 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "body_md"
  ],
  "properties": {
    "body_md": {
      "type": "string",
      "description": "The copy in Markdown (headings, bold, lists, links). For email, exclude the unsubscribe footer; it is added automatically."
    }
  }
} as const;

const BEFORE_4 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "readout",
    "suggestions"
  ],
  "properties": {
    "readout": {
      "type": "string",
      "description": "2-4 sentences: how the month's email marketing performed and what stands out. Plain, specific, grounded in the numbers given. No fluff."
    },
    "suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "title",
          "rationale"
        ],
        "properties": {
          "title": {
            "type": "string",
            "description": "A content type or topic to produce next month."
          },
          "rationale": {
            "type": "string",
            "description": "One sentence tying it to this month's engagement data."
          }
        }
      }
    }
  }
} as const;

const BEFORE_5 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "points"
  ],
  "properties": {
    "points": {
      "type": "array",
      "description": "Five to eight data points, most recent first.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "date",
          "fact",
          "source"
        ],
        "properties": {
          "date": {
            "type": "string",
            "description": "YYYY-MM-DD the fact belongs to."
          },
          "fact": {
            "type": "string",
            "description": "One or two plain sentences, first person, specific: places, numbers, what happened. No client or client-company names; describe people by role and place."
          },
          "source": {
            "type": "string",
            "description": "Which source item it came from (its title)."
          }
        }
      }
    }
  }
} as const;

const BEFORE_6 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "subject",
    "preheader",
    "body_md"
  ],
  "properties": {
    "subject": {
      "type": "string",
      "description": "At most 60 characters. A sentence, not a headline. Not a question every week."
    },
    "preheader": {
      "type": "string",
      "description": "At most 110 characters. The grey line after the subject in the inbox."
    },
    "body_md": {
      "type": "string",
      "description": "Markdown. Opens with 'Hi {first_name},' on its own line, then two or three short paragraphs, then a line that says what the three posts below share, then 'Dave' on its own line. Blank lines between paragraphs. About 170 words, never more than 220. No headings, no lists, no links."
    }
  }
} as const;

const BEFORE_7 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "idea_in_brief",
    "pull_quotes"
  ],
  "properties": {
    "idea_in_brief": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "problem",
        "insight",
        "way_forward"
      ],
      "properties": {
        "problem": {
          "type": "string",
          "description": "One or two sentences: the problem the reader has."
        },
        "insight": {
          "type": "string",
          "description": "One or two sentences: the post's central insight."
        },
        "way_forward": {
          "type": "string",
          "description": "One or two sentences: what the reader does next."
        }
      }
    },
    "pull_quotes": {
      "type": "array",
      "description": "One to three pull quotes.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "quote",
          "anchor_heading"
        ],
        "properties": {
          "quote": {
            "type": "string",
            "description": "A sentence or two copied verbatim from the source material in the idea. Never paraphrased, never from the post body."
          },
          "anchor_heading": {
            "type": "string",
            "description": "The exact text of the ## or ### heading the quote sits under."
          }
        }
      }
    }
  }
} as const;

const BEFORE_8 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "outputs"
  ],
  "properties": {
    "outputs": {
      "type": "array",
      "description": "One entry per active channel other than the blog.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "channel",
          "title",
          "body_md",
          "image_brief_md"
        ],
        "properties": {
          "channel": {
            "type": "string",
            "enum": [
              "email",
              "linkedin",
              "facebook",
              "twitter"
            ]
          },
          "title": {
            "type": "string",
            "description": "Short internal label for this deliverable."
          },
          "subject": {
            "type": "string",
            "description": "Email subject line. Email only."
          },
          "preheader": {
            "type": "string",
            "description": "Email preheader. Email only."
          },
          "body_md": {
            "type": "string",
            "description": "The copy in Markdown, per the channel's rules. Email excludes the unsubscribe footer. Link to the live post where the channel rules ask for a link."
          },
          "social_style": {
            "type": "string",
            "description": "LinkedIn/Facebook/Twitter: the planned social style for this channel when the plan names one, else a slug from the brand's preferred social styles."
          },
          "image_style": {
            "type": "string",
            "description": "A slug from the brand's preferred image styles."
          },
          "image_brief_md": {
            "type": "string",
            "description": "A real brief for this channel's image: the one concept, the palette from the image style, the framing. Not a copy of the blog's brief."
          }
        }
      }
    }
  }
} as const;

const BEFORE_9 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "body_md",
    "change_log"
  ],
  "properties": {
    "body_md": {
      "type": "string",
      "description": "The full edited post in Markdown: paragraphs, ## and ### headings, bold, lists, links. No HTML, no FAQ section, no title heading."
    },
    "change_log": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      },
      "description": "One line per change made: what was cut, moved, sharpened or added, and why. Never empty; if nothing needed changing, say what was checked and why it held."
    }
  }
} as const;

const BEFORE_10 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "exhibits"
  ],
  "properties": {
    "exhibits": {
      "type": "array",
      "description": "Two or three exhibits.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "svg",
          "alt",
          "caption",
          "source",
          "anchor_heading"
        ],
        "properties": {
          "svg": {
            "type": "string",
            "description": "A complete, self-contained SVG document with viewBox=\"0 0 1600 900\", font-family Manrope, brand palette only, no <image>, <script>, <style> imports or external references. Text only for labels, values and units."
          },
          "alt": {
            "type": "string",
            "description": "Alt text describing what the figure shows, one sentence."
          },
          "caption": {
            "type": "string",
            "description": "The figcaption sentence: what the reader should see in the figure."
          },
          "source": {
            "type": "string",
            "description": "Where the numbers come from, as named in the body or the idea (e.g. 'Every, Fable 5.1 review')."
          },
          "anchor_heading": {
            "type": "string",
            "description": "The exact text of an existing ## or ### heading in the body; the figure goes right under it."
          }
        }
      }
    }
  }
} as const;

const BEFORE_11 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "internal",
    "sources"
  ],
  "properties": {
    "internal": {
      "type": "array",
      "description": "Two to four related published posts to link to.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "phrase",
          "slug"
        ],
        "properties": {
          "phrase": {
            "type": "string",
            "description": "A phrase copied exactly from a body paragraph (not a heading or quote), three to eight words, that reads as descriptive anchor text for the target post."
          },
          "slug": {
            "type": "string",
            "description": "The slug of a related published post from the list given."
          }
        }
      }
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "phrase",
          "url"
        ],
        "properties": {
          "phrase": {
            "type": "string",
            "description": "The exact phrase in the body where the source is first mentioned."
          },
          "url": {
            "type": "string",
            "description": "The source URL, copied exactly from the idea."
          }
        }
      },
      "description": "One link per source the idea supplies, at its first mention in the body. Empty if the idea names no URLs."
    }
  }
} as const;

const BEFORE_12 = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "faq",
    "primary_keyword",
    "title",
    "title_tag",
    "meta_description",
    "slug",
    "secondary_keywords",
    "excerpt",
    "category"
  ],
  "properties": {
    "faq": {
      "type": "array",
      "description": "Five questions a founder or manager would type into an AI assistant or search engine about their own problem, in their own words (\"How do I run better one-on-one meetings with AI?\"). Never name the brand, never ask what a report or post says. The FIRST starts with How or What, is the question this post answers best, and contains the primary keyword verbatim.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "question",
          "answer"
        ],
        "properties": {
          "question": {
            "type": "string"
          },
          "answer": {
            "type": "string",
            "description": "Two to four sentences, plain prose, self-contained, no Markdown. Backed by data: at least one specific figure the post body states, in digits or spelled out as the post has it, with its source named when it has one."
          }
        }
      }
    },
    "title": {
      "type": "string",
      "description": "The H1 for humans: the brand hook. May differ from the title tag."
    },
    "title_tag": {
      "type": "string",
      "description": "Keyword-led title tag for search, at most 60 characters. Never the generic '{title} | Brand' pattern."
    },
    "meta_description": {
      "type": "string",
      "description": "Leads with the keyword, names the benefit, ends on a hook. At most 155 characters."
    },
    "slug": {
      "type": "string",
      "description": "kebab-case URL slug, at most 80 characters."
    },
    "primary_keyword": {
      "type": "string",
      "description": "The phrase a real person would search, taken from inside the first FAQ question exactly as written there. Not a sentence."
    },
    "secondary_keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Two to four supporting phrases."
    },
    "excerpt": {
      "type": "string",
      "description": "One or two specific sentences for the listing card."
    },
    "category": {
      "type": "string",
      "description": "One of the blog categories given."
    }
  }
} as const;

describe("campaigns model schemas", () => {
  it("ai/brand-writer.ts (OUTPUT_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(brandWriterOutput_brand_writer))).toEqual(canonicalSchema(BEFORE_0));
  });

  it("ai/campaign-plan.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(campaignPlanOutput_campaign_plan))).toEqual(canonicalSchema(BEFORE_1));
  });

  it("ai/campaign-seo.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(campaignSeoOutput_campaign_seo))).toEqual(canonicalSchema(BEFORE_2));
  });

  it("ai/entry-copy.ts (COPY_SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(entryCopyOutput_entry_copy))).toEqual(canonicalSchema(BEFORE_3));
  });

  it("ai/marketing-recap.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(marketingRecapOutput_marketing_recap))).toEqual(canonicalSchema(BEFORE_4));
  });

  it("letter/step-gather.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(letterGatherOutput_step_gather))).toEqual(canonicalSchema(BEFORE_5));
  });

  it("letter/step-write.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(letterWriteOutput_step_write))).toEqual(canonicalSchema(BEFORE_6));
  });

  it("writer/step-assemble.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(assembleOutput_step_assemble))).toEqual(canonicalSchema(BEFORE_7));
  });

  it("writer/step-channels.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(channelsOutput_step_channels))).toEqual(canonicalSchema(BEFORE_8));
  });

  it("writer/step-edit.ts (SCHEMA) asks for exactly what the hand-written schema asked for, minus one bound", () => {
    // The sweep's one intentional wire change, asserted rather than hidden.
    // `minItems: 1` on the change log was a hint to the model while the reply
    // was cast; derived, it also becomes the validator, and it would reject an
    // empty log with a Zod message and leave step-edit's own "returned no
    // change log" check unreachable behind it. The instruction moved into the
    // field description; the step still enforces it, with its own wording.
    const { minItems, ...changeLogBefore } = BEFORE_9.properties.change_log;
    expect(minItems).toBe(1);
    const before = { ...BEFORE_9, properties: { ...BEFORE_9.properties, change_log: changeLogBefore } };
    expect(canonicalSchema(jsonSchemaFor(editOutput_step_edit))).toEqual(canonicalSchema(before));
  });

  it("writer/step-exhibits.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(exhibitsOutput_step_exhibits))).toEqual(canonicalSchema(BEFORE_10));
  });

  it("writer/step-links.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(linksOutput_step_links))).toEqual(canonicalSchema(BEFORE_11));
  });

  it("writer/step-seo.ts (SCHEMA) asks for exactly what the hand-written schema asked for", () => {
    expect(canonicalSchema(jsonSchemaFor(seoOutput_step_seo))).toEqual(canonicalSchema(BEFORE_12));
  });

});
