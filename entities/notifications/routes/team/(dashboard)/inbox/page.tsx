// /team/inbox (S.3, TH.8): the one place work communication lands. Asks from
// teammates first, the routine's reminders below them, then what happened.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { CardPeekSlot, InboxCardFactsSlot, InboxDecisionsSlot } from "@/kernel/shell/page-slots";
import { inboxFor, larkEchoFor, prefsFor } from "@/entities/notifications/lib/inbox";
import { TeamInboxView, type InboxPart } from "@/entities/notifications/ui/TeamInboxView";
import { cardParam, inPlace, type InboxRow } from "@/entities/notifications/ui/inbox-rows";
import { greeting, remindedCards, teamInbox } from "@/entities/notifications/ui/team-inbox";
import { markInboxAllRead, markInboxDone, markInboxRead, setInboxLarkEcho, setInboxMuted, snoozeInbox, undoInboxDone, unsnoozeInbox } from "./actions";

export const metadata = { title: "Inbox", description: "What changed on your work, and what is waiting on you." };

const PATH = "/team/inbox/";

// `cardPeek` opens a card's drawer over the list (TH.2.6), and `cardFacts`
// says which reminded cards are still work and what they belong to (TH.8).
// Notifications does not require boards, so the composition root hands both
// over (app/shell.ts); a deployment without boards hands nothing, and then rows
// link to the card and every reminder shows, flat.
export default async function TeamInboxPage({
  cardPeek: CardPeek = null,
  cardFacts = null,
  decisions = null,
  searchParams,
}: {
  cardPeek?: CardPeekSlot;
  cardFacts?: InboxCardFactsSlot;
  decisions?: InboxDecisionsSlot;
  searchParams: Promise<{ card?: string | string[]; show?: string | string[] }>;
}) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const [inbox, prefs, larkEcho, params] = await Promise.all([inboxFor(actor.personId, "team"), prefsFor(actor.personId), larkEchoFor(actor.personId), searchParams]);
  // What waits on the person's decision (TH.11), drawn by time-off through the
  // slot with the access this page already resolved; null without time-off.
  const [facts, decided] = await Promise.all([cardFacts ? cardFacts(remindedCards(inbox)) : null, decisions ? decisions({ personId: actor.personId, viewer: access }) : null]);
  const initialPart: InboxPart = params.show === "decisions" ? "decisions" : "all";
  const open = (row: InboxRow): InboxRow => (CardPeek ? inPlace(PATH, [row], []).needs[0] : row);
  const card = CardPeek ? cardParam(params) : null;
  return (
    <>
      <TeamInboxView
        inbox={teamInbox(inbox, facts, open)}
        hello={`${greeting()}, ${actor.displayName}`}
        prefs={prefs}
        larkEcho={larkEcho}
        myWeekHref="/team/my-week"
        decisions={decided?.node ?? null}
        decisionCount={decided?.count ?? 0}
        initialPart={initialPart}
        actions={{
          markRead: markInboxRead,
          markAllRead: markInboxAllRead,
          markDone: markInboxDone,
          undoDone: undoInboxDone,
          setMuted: setInboxMuted,
          setLarkEcho: setInboxLarkEcho,
          snooze: snoozeInbox,
          unsnooze: unsnoozeInbox,
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
