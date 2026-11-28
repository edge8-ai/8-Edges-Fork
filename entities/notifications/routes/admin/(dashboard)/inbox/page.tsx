// /admin/inbox (S.3): the same inbox as /team/inbox, reached from the envelope
// button in the admin sidebar, with links that open on the admin surface.
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import type { CardPeekSlot } from "@/entities/boards";
import { inboxFor, larkEchoFor, prefsFor } from "@/entities/notifications/lib/inbox";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { InboxView } from "@/entities/notifications/ui/InboxView";
import { cardParam, happenedDays, inPlace, needsRows } from "@/entities/notifications/ui/inbox-rows";
import { markInboxAllRead, markInboxDone, markInboxRead, setInboxLarkEcho, setInboxMuted, undoInboxDone } from "./actions";

export const metadata = { title: "Inbox", description: "What changed on your work, and what is waiting on you." };

const PATH = "/admin/inbox/";

// `cardPeek` opens a card's drawer over the list (TH.2.6), as on /team/inbox.
// On /admin a card opens in place only for someone who may open boards here,
// the admin board page's own permission; anyone else keeps the plain links.
export default async function AdminInboxPage({
  cardPeek = null,
  searchParams,
}: {
  cardPeek?: CardPeekSlot;
  searchParams: Promise<{ card?: string | string[] }>;
}) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.admin");
  const admin = access.user;
  const CardPeek = access.may("boards.open") ? cardPeek : null;
  const personId = await personIdForEmail(admin.email);
  if (!personId) {
    return (
      <>
        <PageHead title="Inbox" />
        <p className="admin-empty">
          This sign-in ({admin.email}) has no person record, so nothing can be addressed to it. Add the person in Contacts
          and their inbox starts filling from then on.
        </p>
      </>
    );
  }
  const [inbox, prefs, larkEcho, params] = await Promise.all([inboxFor(personId, "admin"), prefsFor(personId), larkEchoFor(personId), searchParams]);
  let rows = { needs: needsRows(inbox.needs), days: happenedDays(inbox.happened) };
  if (CardPeek) rows = inPlace(PATH, rows.needs, rows.days);
  const card = CardPeek ? cardParam(params) : null;
  return (
    <>
      <PageHead title="Inbox" sub="What changed on your work, and what is waiting on you." />
      <InboxView
        needs={rows.needs}
        days={rows.days}
        prefs={prefs}
        larkEcho={larkEcho}
        myWeekHref={null}
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
        <CardPeek taskId={card} viewer={{ personId, teamMemberId: null, seesEveryBoard: true }} section="/admin" closeHref={PATH} />
      )}
    </>
  );
}
