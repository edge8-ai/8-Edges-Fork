// /admin/inbox (S.3): the same inbox as /team/inbox, reached from the envelope
// button in the admin sidebar, with links that open on the admin surface.
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { inboxFor, prefsFor } from "@/entities/notifications/lib/inbox";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { InboxView } from "@/entities/notifications/ui/InboxView";
import { inboxRows } from "@/entities/notifications/ui/inbox-rows";
import { markInboxAllRead, markInboxRead, setInboxMuted } from "./actions";

export const metadata = { title: "Inbox", description: "What changed on your work since you last looked." };

export default async function AdminInboxPage() {
  // The page's declared permission (ADR 0013).
  const { user: admin } = await requirePermission("surface.admin");
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
  const [inbox, prefs] = await Promise.all([inboxFor(personId, "admin"), prefsFor(personId)]);
  return (
    <>
      <PageHead title="Inbox" sub="What changed on your work since you last looked." />
      <InboxView
        unread={inboxRows(inbox.unread)}
        read={inboxRows(inbox.read)}
        prefs={prefs}
        actions={{ markRead: markInboxRead, markAllRead: markInboxAllRead, setMuted: setInboxMuted }}
      />
    </>
  );
}
