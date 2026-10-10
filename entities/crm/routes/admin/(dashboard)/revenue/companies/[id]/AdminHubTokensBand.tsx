// The company hub's Human Tokens band.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real component — today
// entities/crm/routes/admin/(dashboard)/revenue/companies/[id]/AdminHubTokensBand.tsx.
//
// Fork note: the band shows Bought / Delivered / Balance against tracker
// measurements and carries the controls for granting tokens and adding
// delivered hours by hand. Both the tracker and the commercial model behind it
// are upstream's. The company hub page ships, so the component has to exist; it
// renders nothing.
//
// The prop types are upstream's, copied, and they have to be re-copied when
// upstream's change. Loosening them would be the quiet kind of wrong: a
// `Record<string, unknown>` here hides a prop the call site stops passing. That
// is what happened when #1287 moved `programHref` inside the real band: this
// copy kept requiring it, and the fork's own `next build` type check failed on
// the company page. CI's fork job compiles without type-checking, so it never
// saw it (found by B.31).
import type { HubProgramCard } from "@/entities/team";
import type { TokenUsage } from "@/entities/portal";

export async function AdminHubTokensBand(_props: {
  companyId: string;
  usage: TokenUsage;
  programs: HubProgramCard[];
}) {
  return null;
}
