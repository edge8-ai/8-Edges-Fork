// /team/inbox (S.3): what changed on your work since you last looked.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { inboxFor, prefsFor } from "@/entities/notifications/lib/inbox";
import { InboxView } from "@/entities/notifications/ui/InboxView";
import { inboxRows } from "@/entities/notifications/ui/inbox-rows";
import { markInboxAllRead, markInboxRead, setInboxMuted } from "./actions";

export const metadata = { title: "Inbox", description: "What changed on your work since you last looked." };

export default async function TeamInboxPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const [inbox, prefs] = await Promise.all([inboxFor(actor.personId, "team"), prefsFor(actor.personId)]);
  return (
    <>
      <PageHead eyebrow="Me" title="Inbox" sub="What changed on your work since you last looked." />
      <InboxView
        unread={inboxRows(inbox.unread)}
        read={inboxRows(inbox.read)}
        prefs={prefs}
        actions={{ markRead: markInboxRead, markAllRead: markInboxAllRead, setMuted: setInboxMuted }}
      />
    </>
  );
}
