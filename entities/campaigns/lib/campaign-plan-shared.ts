import { keywordTakenError, repeatsLastError, styleCeilingError, type LedgerRow } from "./campaign-ledger-shared";

// The campaign plan: what the campaign is about and the shape it takes,
// decided from the idea before the writer drafts a word. The primary question
// a reader would ask an AI, the keyword taken from inside it, the blog type,
// the hero image style and each social channel's style. It lives as a labelled
// "## Plan" section at the top of the campaign's SEO/GEO plan (seo_geo_md), so
// a person can read and edit it in the SEO tab, and the hub header, the writer
// and the Log all read the same lines. This half has no database import so the
// browser header and the writer's checks share it.

export type CampaignPlan = {
  angle: string;
  question: string;
  keyword: string;
  blogType: string;
  heroImageStyle: string;
  // Channel slug to social style slug, for each active social channel.
  social: Record<string, string>;
};

const SOCIAL_CHANNELS = ["linkedin", "facebook", "twitter"] as const;
const CHANNEL_NAME: Record<string, string> = { linkedin: "LinkedIn", facebook: "Facebook", twitter: "Twitter" };

const PLAN_HEADING = "## Plan";

export function planMdFrom(plan: CampaignPlan): string {
  const lines = [
    PLAN_HEADING,
    "",
    `**Angle:** ${plan.angle.trim()}`,
    `**Primary question:** ${plan.question.trim()}`,
    `**Primary keyword:** ${plan.keyword.trim()}`,
    `**Blog type:** ${plan.blogType.trim()}`,
    `**Hero image style:** ${plan.heroImageStyle.trim()}`,
  ];
  for (const c of SOCIAL_CHANNELS) if (plan.social[c]) lines.push(`**${CHANNEL_NAME[c]} style:** ${plan.social[c]}`);
  return lines.join("\n");
}

// The "## Plan" section only, so the Search section's own "Primary keyword"
// line below it is never read as the plan's.
function planSection(md: string | null): string | null {
  if (!md) return null;
  const start = md.search(/^## Plan\s*$/m);
  if (start < 0) return null;
  const rest = md.slice(start + PLAN_HEADING.length);
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

function field(section: string, label: string): string | null {
  const line = section.split("\n").find((l) => l.startsWith(`**${label}:**`));
  const value = line?.slice(label.length + 5).trim();
  return value ? value : null;
}

export function parseCampaignPlan(seoGeoMd: string | null): CampaignPlan | null {
  const section = planSection(seoGeoMd);
  if (!section) return null;
  const question = field(section, "Primary question");
  const keyword = field(section, "Primary keyword");
  const blogType = field(section, "Blog type");
  const heroImageStyle = field(section, "Hero image style");
  if (!question || !keyword || !blogType || !heroImageStyle) return null;
  const social: Record<string, string> = {};
  for (const c of SOCIAL_CHANNELS) {
    const v = field(section, `${CHANNEL_NAME[c]} style`);
    if (v) social[c] = v;
  }
  return { angle: field(section, "Angle") ?? "", question, keyword, blogType, heroImageStyle, social };
}

// The SEO/GEO plan with its Plan section replaced, or the Plan put first when
// there is none. Everything else in the document is kept as it was.
export function withPlanSection(seoGeoMd: string | null, planMd: string | null): string {
  const doc = (seoGeoMd ?? "").trim();
  const start = doc.search(/^## Plan\s*$/m);
  let rest = doc;
  if (start >= 0) {
    const after = doc.slice(start + PLAN_HEADING.length);
    const next = after.search(/^## /m);
    rest = (doc.slice(0, start) + (next < 0 ? "" : after.slice(next))).trim();
  }
  if (!planMd) return rest;
  return rest ? `${planMd}\n\n${rest}` : planMd;
}

// A question a reader would type, not one about the post: it never names the
// brand or asks what a source says. Kept here, beside the plan, so the plan
// check and the writer's SEO step apply the same rule.
export function readerQuestionError(questions: string[], brandName: string): string | null {
  const brand = brandName.trim().toLowerCase();
  for (const q of questions) {
    const lower = q.toLowerCase();
    if (brand && lower.includes(brand)) return `The FAQ question "${q}" names ${brandName}; nobody asks an AI about a brand's own process. Ask it the way the reader would, about their own problem.`;
    if (/\b(this|the) (post|article|blog|report|playbook|study|paper)\b|\bsays? about\b|\baccording to\b/.test(lower)) {
      return `The FAQ question "${q}" asks what a source says; ask the reader's question the source answers instead.`;
    }
  }
  return null;
}

// Every rule a plan must meet before it is saved: styles from the brand's
// preferred lists, none of them leaned on by the last posts, a reader's
// question that starts with How or What and carries the keyword, and a
// keyword no earlier post owns.
export function planErrors(
  plan: CampaignPlan,
  ctx: { brandName: string; recent: LedgerRow[]; blogTypes: string[]; imageStyles: string[]; socialStyles: string[]; socialChannels: string[] },
): string[] {
  const errors: string[] = [];
  const allowed = (list: string[], v: string) => list.length === 0 || list.includes(v);
  if (!allowed(ctx.blogTypes, plan.blogType)) errors.push(`Blog type "${plan.blogType}" is not one of the brand's preferred blog types.`);
  if (!allowed(ctx.imageStyles, plan.heroImageStyle)) errors.push(`Hero image style "${plan.heroImageStyle}" is not one of the brand's preferred image styles.`);
  for (const c of ctx.socialChannels) {
    const s = plan.social[c];
    if (!s) errors.push(`No ${c} style in the plan.`);
    else if (!allowed(ctx.socialStyles, s)) errors.push(`The ${c} style "${s}" is not one of the brand's preferred social styles.`);
    else {
      const leaned = styleCeilingError(ctx.recent, "socialStyle", s, c);
      if (leaned) errors.push(leaned);
    }
  }
  for (const e of [styleCeilingError(ctx.recent, "blogType", plan.blogType), styleCeilingError(ctx.recent, "imageStyle", plan.heroImageStyle), repeatsLastError(ctx.recent, "imageStyle", plan.heroImageStyle)]) if (e) errors.push(e);
  if (!/^(how|what)\b/i.test(plan.question.trim())) errors.push(`The primary question must start with How or What; it reads "${plan.question}".`);
  if (!plan.question.toLowerCase().includes(plan.keyword.toLowerCase())) errors.push(`The primary question must contain the keyword "${plan.keyword}" exactly.`);
  const voice = readerQuestionError([plan.question], ctx.brandName);
  if (voice) errors.push(voice);
  const owned = keywordTakenError(ctx.recent, plan.keyword);
  if (owned) errors.push(owned);
  return errors;
}
