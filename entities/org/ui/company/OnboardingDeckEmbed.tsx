import { PageHead } from "@/kernel/ui/PageHead";
import { ONBOARDING_DECK_PATH } from "@/entities/org/lib/onboarding-deck";

// The deck's path lives in lib/onboarding-deck.ts: a plain constant upstream,
// null in a fork (the overlay stubs it), because the fork sync scanner refuses
// a link into the private library and a hidden broken frame helps nobody.
// The "not yet" is read by employees, so it says who to ask rather than which
// file a developer would edit (TH.7.2).

// The onboarding deck lives as a standalone full-screen page (it locks body
// scroll, owns the arrow keys, and writes the slide number to the URL hash).
// Embedding it in an iframe keeps all of that inside the frame so the team
// and admin shells stay around it. Shared by /team and /admin/company.
export function OnboardingDeckEmbed() {
  if (!ONBOARDING_DECK_PATH) {
    return (
      <>
        <PageHead eyebrow="Company" title="Onboarding Deck" sub="Not published yet." />
        <div className="admin-empty">The onboarding deck isn&apos;t published yet. Ask People &amp; Ops.</div>
      </>
    );
  }
  return (
    <>
      <PageHead
        eyebrow="Company"
        title="Onboarding Deck"
        sub="Click the deck, then use the arrow keys or the on-screen controls to move between slides."
        action={
          <a className="admin-btn" href={ONBOARDING_DECK_PATH} target="_blank" rel="noopener">
            Open full screen
          </a>
        }
      />
      <iframe src={ONBOARDING_DECK_PATH} title="Edge8 onboarding deck" className="admin-deck-frame" />
    </>
  );
}
