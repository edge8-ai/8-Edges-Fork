import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { bordersOf, wornTiersFor } from "@/kernel/shell/faces";
import { getSharedIdea, getSharedIdeas } from "@/entities/team/lib/data";
import { ownWithdrawnSparks } from "@/entities/team/lib/spark-reads";
import { PageHead } from "@/kernel/ui/PageHead";
import { Icon } from "@/kernel/ui/Icon";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { IdeaForm } from "./IdeaForm";
import { LearningForm } from "./LearningForm";
import { SparkComposer } from "./SparkComposer";
import { SparkField } from "./SparkField";
import { TeamSky } from "./TeamSky";
import { YourSparks } from "./YourSparks";
import { DECK_ROUND, readFieldFilter, skyStars, skyTicks } from "./sparks-model";
import { SparkDeck } from "./SparkDeck";
import { deckCard } from "./spark-faces";
import { cameBackFor, checkInFor, deckFor, latestThemeReport, readSparkSignals, socialByIdea, socialFor, sparkStage, themeViews, unthemedCount, type SparkStage } from "@/entities/ideas";
import { SparkThemes } from "./SparkThemes";
import { cardsForIdeas } from "@/entities/boards";
import type { BadgeDropsSlot } from "@/entities/ladders";

export const metadata = {
  title: "Ideas that Spark Solutions",
  description: "Got a spark? Share an idea to build or something you learned. Everyone sees every spark.",
};

// Ideas that Spark Solutions (ID.2): the whole team sees every spark. The page
// opens on "Got a spark?" because one line is a whole spark; the long forms
// stay one link away (?compose=build|learning), and ?compose=build&from=<id>
// grows a one-line spark into a 5D plan instead of filing a second copy.

export default async function IdeasPage(props: { searchParams: Promise<SearchParamsObj>; badgeDrops: BadgeDropsSlot }) {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.ideas");
  const searchParams = await props.searchParams;
  const actor = await requireTeamMember();
  const composeParam = firstParam(searchParams.compose);
  const compose = composeParam === "learning" ? "learning" : composeParam === "build" ? "build" : null;

  if (compose) {
    // Only the person's own idea to build, not yet planned, can be grown.
    const fromId = compose === "build" ? firstParam(searchParams.from) : undefined;
    const from = fromId ? await getSharedIdea(actor, fromId) : null;
    const spark =
      from && from.person_id === actor.personId && from.kind !== "learning" && !from.ai_plan
        ? { id: from.id, title: from.title, problem: from.problem ?? "" }
        : undefined;
    return (
      <div className="admin-ideas-page">
        <PageHead
          eyebrow="Ideas"
          title={compose === "build" ? (spark ? "Grow your spark into a plan" : "What should we build?") : "What have I learned?"}
          sub={
            compose === "build"
              ? "Walk the 5D framework: Define, Discover, Design, Determine. Claude turns it into a product plan you keep."
              : "A lesson from your work. It lands on the team feed for everyone."
          }
          action={
            <Link href={spark ? `/team/ideas/${spark.id}` : "/team/ideas"} className="admin-btn">
              Cancel
            </Link>
          }
        />
        <div className="admin-content--form">{compose === "build" ? <IdeaForm spark={spark} /> : <LearningForm />}</div>
      </div>
    );
  }

  const all = await getSharedIdeas();
  const filter = readFieldFilter({
    kind: firstParam(searchParams.kind),
    office: firstParam(searchParams.office),
    stage: firstParam(searchParams.stage),
    mine: firstParam(searchParams.mine),
    q: firstParam(searchParams.q),
    all: firstParam(searchParams.all),
  });
  const mine = all.filter((i) => i.person_id === actor.personId);
  // Six reads that need nothing from each other, side by side: what came back
  // on every spark (the deck, the tiles' faces and Your sparks all draw from
  // it), the cards picked up from them (ID.2.8), this morning's themes (W.189),
  // your withdrawn sparks (TH.4.6), and the worn borders of every spark's
  // author (LD.8): one ask of the kernel's faces seam, for this reader, for
  // every author the deck and the field can draw. The seam answers nothing when
  // the reader's game style is off; each face is handed the tier alone. And the
  // reader's own badge drop (LD.7b): a badge their spark just found falls into a
  // chip under the composer, from ladders through the page slot; nothing when
  // ladders is not installed or nothing waits.
  const [{ reactions, builds }, cards, report, withdrawn, worn, drop] = await Promise.all([
    readSparkSignals(),
    cardsForIdeas(all.map((i) => i.id)),
    latestThemeReport(),
    ownWithdrawnSparks(actor),
    wornTiersFor(all.map((i) => i.person_id), { personId: actor.personId }),
    props.badgeDrops ? props.badgeDrops({ personId: actor.personId }, "spark") : null,
  ]);
  const borders = bordersOf(worn);
  const social = socialByIdea(reactions, builds);
  const byId = new Map(all.map((i) => [i.id, i]));
  const deck = deckFor(actor.personId, all, reactions, builds).map((ref) => deckCard(byId.get(ref.id)!, socialFor(ref.id, social), borders));
  // One "did it hold?" when a learning is due (ID.2.9). It closed the deck when
  // the deck was three cards; now that the deck holds every unanswered spark
  // (TH.4.3) it closes the first round instead, where it always sat.
  const checkIn = checkInFor(actor.personId, all, reactions, new Date());
  const checkInAt = Math.min(DECK_ROUND, deck.length);
  if (checkIn) deck.splice(checkInAt, 0, { ...deckCard(byId.get(checkIn.id)!, socialFor(checkIn.id, social), borders), checkIn: true });
  const firstRound = checkIn ? checkInAt + 1 : DECK_ROUND;
  // Where each spark has got to (ID.2.8), from the cards picked up from them.
  const stages = new Map<string, SparkStage>(
    all.map((i) => [i.id, sparkStage(socialFor(i.id, social).builds, cards.filter((c) => c.ideaId === i.id))]),
  );
  // The team sky draws each spark at its stage (ID.2.12).
  const now = new Date();
  const stars = skyStars(all, now, actor.personId, (id) => stages.get(id) ?? "spark");
  const ticks = skyTicks(all, now);
  const cameBack = cameBackFor(actor.personId, all, reactions, builds, 4, cards);
  // What the team keeps raising (W.189): the themes, drawn from the same
  // sparks, answers and cards the rest of the page reads. A spark's echoes are
  // the people who admired it, hit it too, or built on it.
  const echoesOf = (id: string) => {
    const s = socialFor(id, social);
    return new Set([...s.admirers, ...s.meToo].map((f) => f.personId)).size + s.builds;
  };
  const picked = new Set(cards.filter((c) => c.status !== "not_doing").map((c) => c.ideaId));
  const themes = report ? themeViews(report.themes, all, echoesOf, (id) => picked.has(id)) : null;
  const unthemed = report ? unthemedCount(report.themes, all) : 0;

  return (
    <div className="sparks-page">
      <section className="sparks-hero" aria-labelledby="sparks-title">
        <div className="sparks-hero-main">
          <div className="sparks-eyebrow">
            <Icon name="spark" />
            Ideas that Spark Solutions
          </div>
          <h1 id="sparks-title" className="sparks-title">
            Got a spark? Drop it here.
          </h1>
          <p className="sparks-sub">
            Every spark is for everyone. An idea for the CEO, for your lead or for your own team is welcome, in any
            direction.
          </p>
          <SparkComposer />
          {drop}
        </div>
        <TeamSky stars={stars} ticks={ticks} />
      </section>

      <div className="sparks-body">
        <section className="sparks-deck-section" aria-labelledby="deck-h">
          <h2 id="deck-h" className="sparks-h2">
            Your deck
          </h2>
          <p className="sparks-lede">Sparks you haven&apos;t answered yet, fewest answers first and a different teammate each time.</p>
          <SparkDeck initial={deck} firstRound={firstRound} />
        </section>
        <YourSparks mine={mine} cameBack={cameBack} withdrawn={withdrawn} />
      </div>

      <SparkThemes themes={themes} generatedAt={report?.generatedAt ?? null} unthemed={unthemed} />

      <SparkField ideas={all} filter={filter} social={social} stages={stages} personId={actor.personId} borders={borders} />
    </div>
  );
}
