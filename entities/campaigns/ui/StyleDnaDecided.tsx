"use client";

import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { styleDnaDecisionsFor, styleDnaHeadingFor } from "@/entities/campaigns/lib/style-dna";

export type StyleDnaLoad =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; styleDnaMd: string | null; brandSlug: string | null };

// One chip per decision: a Style DNA line is `- Label: value`, so the bullet
// is dropped and blank lines are skipped.
function chipsOf(lines: string[]): string[] {
  return lines.map((l) => l.trim().replace(/^[-*]\s+/, "")).filter(Boolean);
}

// The box above a post's image brief showing the brand's Style DNA
// (R3.343.3): the Fixed decisions and this channel's, never another channel's
// (styleDnaDecisionsFor). No picture is made from it since R3.350: the
// code-drawn hero and sets take the brand kit's colours, type and logo. What
// reads it is the writer, when it drafts a brief, so the box is labelled for
// that. It lives with the entity, beside the Style DNA it reads.
export function StyleDnaDecided({ load, channel }: { load: StyleDnaLoad; channel: string | null }) {
  if (load.status === "loading") return null;
  if (load.status === "error") {
    return <div className="admin-alert admin-alert--err">Could not read this brand&apos;s Style DNA: {load.error}</div>;
  }
  const decided = styleDnaDecisionsFor(load.styleDnaMd, channel);
  const channelHeading = styleDnaHeadingFor(channel);
  const fixed = decided.legacy ? [] : chipsOf(decided.fixed);
  const forChannel = decided.legacy ? [] : chipsOf(decided.channel);
  const nothing = decided.legacy ? !decided.text : fixed.length === 0 && forChannel.length === 0;

  return (
    <div className="admin-callout cal-brief-decided u-stack">
      <div className="admin-label">Style DNA the writer drafts from</div>
      {nothing ? (
        <div className="admin-hint">Nothing yet.</div>
      ) : decided.legacy ? (
        // Free text from before Style DNA is one guidance, not a list of decisions.
        <div className="admin-hint u-prewrap">{decided.text}</div>
      ) : (
        <>
          {fixed.length > 0 && (
            <div className="admin-chiplist">
              {fixed.map((c, i) => <span key={i} className="admin-chip">{c}</span>)}
            </div>
          )}
          {channelHeading && forChannel.length > 0 && (
            <>
              <div className="admin-label">{channelHeading}</div>
              <div className="admin-chiplist">
                {forChannel.map((c, i) => <span key={i} className="admin-chip">{c}</span>)}
              </div>
            </>
          )}
        </>
      )}
      {load.brandSlug && (
        <Link className="cal-brief-dna-link" href={`/admin/revenue/marketing/brands/${load.brandSlug}?tab=visuals`}>
          Edit Style DNA
        </Link>
      )}
    </div>
  );
}
