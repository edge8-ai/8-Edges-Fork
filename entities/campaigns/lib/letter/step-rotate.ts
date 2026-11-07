import { ctaCatalog, ctaKeyFor, nextInRotation, nextLayout } from "./ctas";
import { recentSentLetters, updateLetter } from "./data";
import type { StepRunner } from "./types";

// Step 4: the call to action and the layout, strict round robin from what the
// last sent letter carried. The first letter is the list layout (the plainest
// email, the one that reads most like a note) with the conversation CTA.

export const runRotate: StepRunner = async ({ letter }) => {
  const [last] = await recentSentLetters(1);
  const lastCta = last ? ctaKeyFor(last.blocks.cta) : null;
  const lastLayout = last ? last.blocks.layout : null;

  const entry = nextInRotation(ctaCatalog(), lastCta, (e) => Boolean(e.cta));
  if (!entry?.cta) return { ok: false, error: "Rotate: no call to action in the catalog has a landing page." };
  const layout = nextLayout(lastLayout);

  const blocks = { ...letter.blocks, cta: entry.cta, layout };
  const saved = await updateLetter(letter.id, { blocks });
  if (!saved.ok) return saved;
  letter.blocks = blocks;
  return { ok: true, summary: `CTA "${entry.cta.label}" (after ${lastCta ?? "none"}), layout ${layout} (after ${lastLayout ?? "none"}).` };
};
