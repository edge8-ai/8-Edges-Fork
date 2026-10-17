// /team/inbox (S.3): what changed on your work since you last looked.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { CardPeekSlot } from "@/kernel/shell/page-slots";
import { PageHead } from "@/kernel/ui/PageHead";
import { inboxFor, larkEchoFor, prefsFor } from "@/entities/notifications/lib/inbox";
import { InboxView } from "@/entities/notifications/ui/InboxView";
import { cardParam, happenedDays, inPlace, needsRows } from "@/entities/notifications/ui/inbox-rows";
import { markInboxAllRead, markInboxDone, markInboxRead, setInboxLarkEcho, setInboxMuted, undoInboxDone } from "./actions";

export const metadata = { title: "Inbox", description: "What changed on your work, and what is waiting on you." };

const PATH = "/team/inbox/";

// `cardPeek` opens a card's drawer over the list (TH.2.6). Notifications does
// not require boards, so the composition root hands it over (app/shell.ts),
// and a deployment without boards hands nothing: rows then link to the card.
export default async function TeamInboxPage({
  cardPeek: CardPeek = null,
  searchParams,
}: {
  cardPeek?: CardPeekSlot;
  searchParams: Promise<{ card?: string | string[] }>;
}) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const [inbox, prefs, larkEcho, params] = await Promise.all([inboxFor(actor.personId, "team"), prefsFor(actor.personId), larkEchoFor(actor.personId), searchParams]);
  let rows = { needs: needsRows(inbox.needs), days: happenedDays(inbox.happened) };
  if (CardPeek) rows = inPlace(PATH, rows.needs, rows.days);
  const card = CardPeek ? cardParam(params) : null;
  return (
    <>
      <PageHead eyebrow="Me" title="Inbox" sub="What changed on your work, and what is waiting on you." />
      <InboxView
        needs={rows.needs}
        days={rows.days}
        prefs={prefs}
        larkEcho={larkEcho}
        myWeekHref="/team/my-week"
        actions={{
          markRead: markInboxRead,
          markAllRead: markInboxAllRead,
          markDone: markInboxDone,
          undoDone: undoInboxDone,
          setMuted: setInboxMuted,
          setLarkEcho: setInboxLarkEcho,
        }}
      />
      {CardPeek && card && (
        <CardPeek
          taskId={card}
          viewer={{ personId: actor.personId, teamMemberId: actor.teamMemberId, seesEveryBoard: actor.isAdmin }}
          section="/team"
          closeHref={PATH}
        />
      )}
    </>
  );
}
