// The owner's Achievements tab, read (LD.7b): the reader's own standing,
// already read behind ladders.mine by the owner's profile, plus their own act
// facts and the company's per-badge totals (lib/badge-facts.ts), shaped into
// the badge case and drawn by AchievementsView. It takes the reader and their
// standing, never a subject id; the owner's profile is its only caller.
import { markShown } from "../../lib/shown-actions";
import { setDisplay } from "../../lib/display-actions";
import { myBadgeFacts } from "../../lib/badge-facts";
import type { Reader, Standing } from "../../lib/standing";
import { AchievementsView } from "./AchievementsView";
import { badgeCase } from "./badge-case";

export async function OwnAchievements({ reader, standing }: { reader: Reader; standing: Standing }) {
  const { facts, totals } = await myBadgeFacts(reader, standing);
  const model = badgeCase(standing.badgesFound, standing.display.displayCase, facts, totals);
  const note = facts ? null : "Your counts could not be read just now, so the locked tiles show their rule alone. Reload to try again.";
  return <AchievementsView model={model} note={note} actions={{ setDisplay, markShown }} />;
}
