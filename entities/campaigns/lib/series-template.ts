import { z } from "zod/v4";
import { companyOs } from "@/kernel/data/supabase";
import { SELF_BRAND_SLUG } from "@/kernel/config/brand";
import { selectBrands } from "@/entities/contacts";
import { siteForBrandSlug } from "./brand-sites";
import { getBrandProfileBySlug } from "./brand-profiles";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "./writer/model";
import { WRITER_SERIES_INTRO_PROMPT } from "./series-template.prompt";
import { nextCoaching } from "./learner-progress";

// The weekly issue body, from its series' template, filled once when the draft
// opens. Per-recipient placeholders ({first_name}, the personal sections) are
// left for send time.
//   {next_coaching} - the next live coaching session after the send, in the series' zone
//   {latest_post}   - the newest published house blog post no earlier issue has used
//   {intro}         - a first draft of the personal note, written for the author to rewrite

// Left in place of an intro the model could not draft. Approval refuses a body
// that still carries it, so an issue cannot go out without its note.
export const INTRO_MARKER = "[Write this week's intro]";

function coachingLine(at: string, zone: string): string {
  const when = new Intl.DateTimeFormat("en-AU", { timeZone: zone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(at));
  return when.replace(" at ", ", ");
}

async function latestPost(previousBodies: string[]): Promise<{ title: string; excerpt: string; url: string } | null> {
  const { data: brand, error: brandError } = await selectBrands("id").eq("slug", SELF_BRAND_SLUG).maybeSingle();
  if (brandError || !brand) return null;
  const { data, error } = await companyOs.from("marketing_content").select("title, excerpt, slug")
    .eq("channel", "blog")
    .eq("status", "published")
    .eq("brand_id", brand.id as string)
    .not("slug", "is", null)
    .order("publish_date", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[campaigns/series-template] posts", error.message);
    return null;
  }
  const domain = siteForBrandSlug(SELF_BRAND_SLUG)?.domain ?? "";
  const post = (data ?? []).find((p) => !previousBodies.some((b) => b.includes(`/post/${p.slug}/`))) ?? data?.[0];
  return post ? { title: post.title, excerpt: post.excerpt ?? "", url: `${domain}/post/${post.slug}/` } : null;
}

async function draftIntro(context: string): Promise<string | null> {
  const profile = await getBrandProfileBySlug(SELF_BRAND_SLUG);
  if (!profile) return null;
  const result = await callWriterModel({
    step: "series-intro",
    prompt: WRITER_SERIES_INTRO_PROMPT,
    system: fillPrompt(WRITER_SERIES_INTRO_PROMPT.system, { preamble: brandPreamble(profile) }),
    user: context,
    schema: z.object({ intro: z.string().min(1) }),
  });
  if (!result.ok) console.error("[campaigns/series-template] intro", result.error);
  return result.ok ? result.data.intro.trim() : null;
}

export async function fillIssueTemplate(template: string, sendAt: Date, zone: string, previousBodies: string[]): Promise<string> {
  if (!template.trim()) return "";
  const [coaching, post] = await Promise.all([
    template.includes("{next_coaching}") || template.includes("{intro}") ? nextCoaching(sendAt) : null,
    template.includes("{latest_post}") || template.includes("{intro}") ? latestPost(previousBodies) : null,
  ]);
  const intro = template.includes("{intro}")
    ? await draftIntro(
        [
          coaching
            ? fillPrompt(WRITER_SERIES_INTRO_PROMPT.parts.coaching, { when: coachingLine(coaching.at, zone) })
            : WRITER_SERIES_INTRO_PROMPT.parts.noCoaching,
          post ? fillPrompt(WRITER_SERIES_INTRO_PROMPT.parts.article, { title: post.title, excerpt: post.excerpt }) : "",
        ].join("\n"),
      )
    : null;

  return template
    .split("{next_coaching}").join(coaching ? coachingLine(coaching.at, zone) : "")
    .split("{latest_post}").join(post ? `**[${post.title}](${post.url})**\n${post.excerpt}` : "")
    .split("{intro}").join(intro ?? INTRO_MARKER);
}
