import { requirePermission } from "@/kernel/identity/access-request";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHead } from "@/kernel/ui/PageHead";
// The public site's shared vocabulary lives in these two sheets, which admin
// routes do not normally load. Import them here so the swatches render with the
// real rules, the way /admin/patterns renders the real .admin-* classes.
export const metadata: Metadata = { title: "Pattern library — public site" };

// Living reference for the SHARED public-site vocabulary: the classes a new
// marketing or workflow page composes from. Page-specific compositions (the
// blog teaser, the application form, the workflow graph internals) live with
// their page and are not catalogued here. Reach it at /admin/patterns/public.

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="admin-card admin-section-card admin-pat-section">
      <h2 className={`admin-card-title ${sub ? "u-mb-1" : "u-mb-4"}`}>{title}</h2>
      {sub && <p className="admin-pat-caption u-mt-0 u-mb-4">{sub}</p>}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="u-row-top u-wrap u-gap-3 u-mb-4">
      <code className="admin-pat-swatch-meta admin-pat-row-label">{label}</code>
      <div className="u-grow u-min-0">{children}</div>
    </div>
  );
}

export default async function SitePatternsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.admin");
  return (
    <div className="admin-main">
      <PageHead title="Pattern library — public site" sub="The shared classes a public page composes from. The admin kit is at /admin/patterns." />

      <div className="admin-pat-stack">
        <Section title="Section bands" sub="Full-width section backgrounds the marketing pages alternate between. Modifiers on the element, never inline.">
          <Row label=".section--white"><div className="section--white admin-pat-demo">White band</div></Row>
          <Row label=".section--tint"><div className="section--tint admin-pat-demo">Tint band</div></Row>
          <Row label=".wf-section--dark"><div className="wf-section--dark admin-pat-demo">Dark band (workflow pages)</div></Row>
        </Section>

        <Section title="Headings and eyebrows" sub="Section titles, labels and subs are in globals.css; the site-* leads and eyebrows in site-components.css.">
          <Row label=".section-label"><span className="section-label">Operations, in the open</span></Row>
          <Row label=".section-title"><div className="section-title">It is time to lead AI</div></Row>
          <Row label=".section-sub"><p className="section-sub">A supporting sentence under a section title.</p></Row>
          <Row label=".site-eyebrow"><p className="site-eyebrow">The founder POV</p></Row>
          <Row label=".site-eyebrow--lg"><p className="site-eyebrow site-eyebrow--lg">Track record</p></Row>
          <Row label=".site-quote"><blockquote className="site-quote">It is not an AI problem. It is the data.</blockquote></Row>
        </Section>

        <Section title="Body and stats" sub="Lead paragraphs, notes, and the big blue stat figure.">
          <Row label=".site-lead"><p className="site-lead">A lead paragraph: larger, muted, generous line height.</p></Row>
          <Row label=".site-lead--sm"><p className="site-lead site-lead--sm">The smaller lead variant.</p></Row>
          <Row label=".site-note"><p className="site-note">A small footnote under a section.</p></Row>
          <Row label=".site-stat"><div className="site-stat">75%</div></Row>
        </Section>

        <Section title="Chips and links" sub="Inline pills and link treatments used across the marketing pages.">
          <Row label=".site-chip--glass"><span className="wf-section--dark admin-pat-chip-host"><span className="site-chip--glass admin-pat-chip-inner">On a dark hero</span></span></Row>
          <Row label=".site-link-muted"><a href="#" className="site-link-muted">Muted link</a></Row>
          <Row label=".site-partner-link"><a href="#" className="site-partner-link">LinkedIn →</a></Row>
        </Section>

        <Section title="Workflow badges" sub="The workflow library's taxonomy chips: office category, actor, and gate outcome.">
          <Row label=".wf-cat-*">
            <span className="wf-cat-talent admin-pat-pill">Talent</span>
            <span className="wf-cat-revenue admin-pat-pill">Revenue</span>
            <span className="wf-cat-operations admin-pat-pill">Operations</span>
            <span className="wf-cat-innovation admin-pat-pill">Innovation</span>
          </Row>
          <Row label=".wf-actor-*">
            <span className="wf-actor-ai admin-pat-pill">AI</span>
            <span className="wf-actor-human admin-pat-pill">Human</span>
            <span className="wf-actor-system admin-pat-pill">System</span>
          </Row>
          <Row label=".wf-outcome-*">
            <span className="wf-outcome-approve admin-pat-pill">Approve</span>
            <span className="wf-outcome-reject admin-pat-pill">Reject</span>
            <span className="wf-outcome-info admin-pat-pill">Info</span>
          </Row>
        </Section>
      </div>
    </div>
  );
}
