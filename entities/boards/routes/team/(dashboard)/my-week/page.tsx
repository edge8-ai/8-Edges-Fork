import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { InboxLineSlot } from "@/kernel/shell/page-slots";
import { saigonToday } from "@/kernel/config/dates";
import { readMyWeek } from "@/entities/boards/lib/my-week-read";
import { myWeek, sprintStartOf } from "@/entities/boards/lib/my-week";
import { MyWeek } from "@/entities/boards/ui/MyWeek";

export const metadata = { title: "My week" };

// My Week (W.61, rebuilt in W.169): the page a person opens to see their work.
//
// THE SELF-VIEW IS ENFORCED HERE, IN ONE LINE. The guard resolves the actor
// from the JWT (never from a query string), and `actor.personId` is the only
// person the read will ever take: the route accepts no search params, and the
// model it feeds has no argument that names a person. An admin who opens this
// page is a team actor like anyone else and sees their own week, not
// everyone's — admin status never widens team scope (kernel/identity/team-auth.ts).
//
// A card assigned to you is yours to read wherever it was filed, so the read
// spans every board — and it asks only for your cards, by assignee, in SQL
// (lib/my-week-read.ts), rather than loading the company's board to filter it.
//
// `inboxLine` is the Inbox in one line (W.169.4). Boards does not require the
// notifications entity, so it never names it: the generated mount passes what
// app/shell.ts provides (boards' mounts.ts, `slots`), which is null in a
// deployment without an inbox.
export default async function MyWeekPage({ inboxLine: InboxLine = null }: { inboxLine?: InboxLineSlot }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const today = saigonToday();
  const read = await readMyWeek(actor.personId, sprintStartOf(today));
  return <MyWeek model={myWeek(read, today)} inboxLine={InboxLine ? <InboxLine personId={actor.personId} /> : null} />;
}
