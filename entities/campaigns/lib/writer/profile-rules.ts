import type { BrandProfile } from "@/entities/campaigns/lib/brand-profiles";

// The brand profile is the spec. Nothing in the pipeline hard-codes a word
// count or a channel list; these readers pull the two facts the checks need
// out of the profile's prose, and a profile that does not state them fails the
// step with a message that says what to add under Marketing > Brands.

export type WordRange = { min: number; max: number };

// "1500 to 2500 words", "1,500-2,500 words", "1500–2500 words". The blog
// section of channels_md is read first because that is where the channel's
// own rule lives; process_md is the fallback.
export function wordRangeFrom(profile: Pick<BrandProfile, "channelsMd" | "processMd">): WordRange | null {
  const pattern = /(\d{1,2}[,.]?\d{3}|\d{3,5})\s*(?:to|-|–|—)\s*(\d{1,2}[,.]?\d{3}|\d{3,5})\s*words/i;
  for (const text of [blogSection(profile.channelsMd), profile.channelsMd, profile.processMd]) {
    const m = text?.match(pattern);
    if (!m) continue;
    const min = Number(m[1].replace(/[,.]/g, ""));
    const max = Number(m[2].replace(/[,.]/g, ""));
    if (min > 0 && max > min) return { min, max };
  }
  return null;
}

function blogSection(channelsMd: string | null): string | null {
  if (!channelsMd) return null;
  const m = channelsMd.match(/^##\s*Blog\s*$([\s\S]*?)(?=^##\s|\s*$(?![\s\S]))/im);
  return m ? m[1] : null;
}

export type WriterChannel = "blog" | "email" | "linkedin" | "facebook" | "twitter";

// The line under "## Active channels" ("Blog, LinkedIn, Facebook, email.").
// A profile without that heading is read as blog-only, which is the one
// channel the pipeline cannot do without.
export function activeChannelsFrom(profile: Pick<BrandProfile, "channelsMd">): WriterChannel[] {
  const md = profile.channelsMd ?? "";
  const m = md.match(/^##\s*Active channels\s*$\s*([^\n]+)/im);
  if (!m) return ["blog"];
  const found = new Set<WriterChannel>();
  for (const ch of ["blog", "email", "linkedin", "facebook", "twitter"] as const) {
    if (new RegExp(`\\b${ch}\\b`, "i").test(m[1])) found.add(ch);
  }
  if (!found.has("blog")) found.add("blog");
  return ["blog", "email", "linkedin", "facebook", "twitter"].filter((c): c is WriterChannel => found.has(c as WriterChannel));
}
