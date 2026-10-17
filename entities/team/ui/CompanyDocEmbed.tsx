import { PageHead } from "@/kernel/ui/PageHead";

// A company document from the private workflows library, framed inside the
// team shell so a member reads it without leaving the portal. The library
// admits a signed-in team member without the access code (the gate in
// entities/library), which is what makes the frame work. The path comes from
// lib/company-docs.ts: a constant upstream, null in a fork, and null renders a
// plain "not yet" instead of a broken frame. Same shape as OnboardingDeckEmbed.
//
// The "not yet" is read by employees, so it says who to ask rather than which
// file a developer would edit (TH.7.2).
type Props = { title: string; sub: string; path: string | null };

export function CompanyDocEmbed({ title, sub, path }: Props) {
  if (!path) {
    return (
      <>
        <PageHead eyebrow="Company" title={title} sub="Not published yet." />
        <div className="admin-empty">This document isn&apos;t published yet. Ask People &amp; Ops.</div>
      </>
    );
  }
  return (
    <>
      <PageHead
        eyebrow="Company"
        title={title}
        sub={sub}
        action={
          <a className="admin-btn" href={path} target="_blank" rel="noopener">
            Open full page
          </a>
        }
      />
      <iframe src={path} title={title} className="admin-deck-frame" />
    </>
  );
}
