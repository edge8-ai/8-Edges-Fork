import { resolveBroadcastBlocks } from "@/entities/campaigns/lib/broadcast-blocks";
import { ctaCatalog } from "./ctas";
import type { StepRunner } from "./types";

// Step 5: the posts and the button as the email will carry them. Every picked
// post must still resolve to a published post with a slug and a hero, and
// the call to action's page must answer. A post that lost its hero since the
// pick is a hole in the email, not a warning.

// Null when the page answers, otherwise why not. The 14 September run failed
// every page with no status on record, so the reason now travels into the
// error; a named user agent and a timeout keep the check from looking like an
// anonymous bot or hanging the step.
const CHECK_INIT = { redirect: "follow", headers: { "user-agent": "Edge8-LetterAgent/1.0 (link check)" } } as const;

async function whyNotAnswering(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { ...CHECK_INIT, method: "HEAD", signal: AbortSignal.timeout(10_000) });
    if (res.ok) return null;
    const get = await fetch(url, { ...CHECK_INIT, method: "GET", signal: AbortSignal.timeout(10_000) });
    return get.ok ? null : `answered ${get.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// The site's own pages are checked from data, never fetched (Y.75). The letter
// reaches assemble by handing itself on over HTTP (run-loop), so a fetch of the
// site's own domain from here is one more hop through the same deployment, and
// Vercel answers 508 (loop detected): the letters of 1 Oct and 8 Oct were lost
// to it. A post on our site is live exactly when resolveBroadcastBlocks found it
// published with a slug, and a button on our site must be one of the catalogue's
// pages, which this deployment's own code serves. Another site's page is still
// fetched, because only a request can say whether it answers.
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isOwnSite(url: string): boolean {
  const own = hostOf(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  return own !== null && hostOf(url) === own;
}

function sameUrl(a: string, b: string): boolean {
  return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

export const runAssemble: StepRunner = async ({ letter }) => {
  const rendered = await resolveBroadcastBlocks(letter.blocks);
  const problems: string[] = [];
  if (rendered.posts.length !== letter.blocks.posts.length) problems.push(`${letter.blocks.posts.length - rendered.posts.length} picked post(s) no longer resolve to a published post with a slug.`);
  for (const p of rendered.posts) if (!p.imageUrl) problems.push(`"${p.title}" has no hero image.`);
  if (!rendered.cta) problems.push("No call to action.");
  else if (isOwnSite(rendered.cta.url)) {
    const url = rendered.cta.url;
    const known = ctaCatalog().some((e) => e.cta !== null && sameUrl(e.cta.url, url));
    if (!known) problems.push(`The call to action is on this site but is not one of the letter's call to action pages: ${url}`);
  } else {
    const why = await whyNotAnswering(rendered.cta.url);
    if (why) problems.push(`The call to action page did not answer (${why}): ${rendered.cta.url}`);
  }
  for (const p of rendered.posts) {
    if (isOwnSite(p.url)) continue;
    const why = await whyNotAnswering(p.url);
    if (why) problems.push(`The post page did not answer (${why}): ${p.url}`);
  }
  if (problems.length) return { ok: false, error: `Assemble: ${problems.join(" ")}` };
  return { ok: true, summary: `${rendered.posts.length} posts and the "${rendered.cta?.label}" button, all live, layout ${rendered.layout}.` };
};
