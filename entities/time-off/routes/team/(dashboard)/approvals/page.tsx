// /team/approvals (S.5, Z.2.1): the approvals inbox. Every pending approval
// that waits on the signed-in person, on a role they hold, or (for whoever
// enters the Admin view) on nobody in particular, each with who asked, whose
// decision it is and a link to the page it is decided on. Leave named on this
// person is decided in its row; everything else is decided where it lives.
//
// Why it stays in time-off although it lists every subject: the only decision
// it writes is leave, and the entity that owns a table owns the screen that
// writes it. Every other row is a link, built by the kernel's approvals
// presentation, so no other entity is reached from here.
//
// Every team login may open it (surface.team). It used to ask for
// time-off.approve, which shut out a Finance checker or a Revenue approver with
// a claim or a draft waiting on their role. Who sees which rows is the reader's
// rule (kernel/approvals/waiting), not the guard's; with nothing waiting the
// page says so rather than sending them away.
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { approvalsInbox } from "@/kernel/approvals/inbox";
import { PageHead } from "@/kernel/ui/PageHead";
import { timeAgo } from "@/kernel/ui/format";
import { ApprovalsInbox, type InboxEntry } from "./ApprovalsInbox";
import { decideLeaveRequest } from "./actions";

export const metadata = { title: "Approvals", description: "Everything waiting on your decision, or on a role you hold." };

export default async function TeamApprovalsPage() {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const rows = await approvalsInbox(actor.personId, access, { surface: "team" });

  const entries: InboxEntry[] = rows.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    subject: r.subject,
    tier: r.tier,
    tierChip: r.tierChip,
    title: r.title,
    askedBy: r.askedBy,
    asked: timeAgo(r.createdAt),
    namedOnMe: r.namedOnMe,
    whose: r.whose,
    // Leave named on this person is decided in the row by decideLeaveAsManager,
    // which refuses anyone its resolver does not name; leave waiting on the
    // admins is decided on the admin board, which the row links to instead.
    inline: r.subjectType === "time_off" && r.namedOnMe,
    href: r.subjectType === "time_off" && r.namedOnMe ? null : r.href,
    cta: r.cta,
    facts: r.facts,
  }));

  return (
    <div className="admin-approvals">
      <PageHead
        eyebrow="Inbox"
        title="Approvals"
        sub="Everything waiting on you, or on a role you hold. Open one to decide it where it lives. Nothing is approved on a timeout."
      />
      <ApprovalsInbox entries={entries} decide={decideLeaveRequest} />
      <p className="admin-approvals-foot">
        Tier 1 is a message to one outside person. Tier 2 is anything public, to many people, or a commitment. Each waits
        for its approver; nothing on this list goes out on a timeout.
      </p>
    </div>
  );
}
