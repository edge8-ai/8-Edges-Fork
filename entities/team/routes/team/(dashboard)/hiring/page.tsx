import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { dateMs, saigonToday } from "@/kernel/config/dates";
import { getTeamHiring, getMyInterviewDay, type HiringReq, type MyInterview } from "@/entities/team/lib/hiring";
import { CandidateActions } from "./CandidateActions";
import { HiringFilter } from "./HiringFilter";
import { RoleCard } from "./RoleCard";
import { ClosedRoles, HowHiringWorks, YourInterviews, YourLoops } from "./HiringParts";
import { fmtDay, fmtTime } from "./hiring-chips";

export const metadata = { title: "Hiring" };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The hero's two lines: what is open, then what waits on the reader or what comes first. */
function heroLines(reqs: HiringReq[], myDay: MyInterview[]): { headline: string; sub: string } {
  const inFlight = reqs.reduce((n, r) => n + r.activeCount, 0);
  const applied = reqs.reduce((n, r) => n + r.candidates.length, 0);
  const headline =
    reqs.length === 0
      ? "No roles are open."
      : `${plural(reqs.length, "role is", "roles are")} open. ` +
        (applied === 0 ? "Nobody has applied yet." : inFlight === 0 ? "Nobody is in flight." : `${plural(inFlight, "person is", "people are")} in flight.`);
  const next = myDay.find((i) => i.isToday && (i.state === "up_next" || i.state === "in_progress"));
  const due = myDay.filter((i) => i.state === "scorecard_due").length;
  if (next || due) {
    const parts = [next ? `you have an interview at ${fmtTime(next.scheduledAt)} today` : null, due ? `${plural(due, "scorecard is", "scorecards are")} due` : null].filter(Boolean);
    const sub = parts.join(", and ");
    return { headline, sub: `${sub.charAt(0).toUpperCase()}${sub.slice(1)}.` };
  }
  const oldest = [...reqs].filter((r) => r.openedAt).sort((a, b) => (a.openedAt ?? "").localeCompare(b.openedAt ?? ""))[0];
  if (!oldest?.openedAt) return { headline, sub: "Roles you hire for show here, with everyone in flight and where they stand." };
  const days = Math.max(0, Math.round((dateMs(saigonToday()) - dateMs(oldest.openedAt.slice(0, 10))) / 86_400_000));
  return { headline, sub: `${oldest.title} has been open since ${fmtDay(oldest.openedAt)}, ${plural(days, "day", "days")}.` };
}

// /team/hiring, hiring managers only (TH.18 redesign). A hiring manager is
// someone who owns at least one requisition (or an admin); org "manager" role
// and interview-panel seats do not grant access. Open roles, who is in flight,
// the loop each role runs, and where this manager sits. Written from /admin/talent.
export default async function TeamHiringPage() {
  // team.hiring is held by hiring managers, admins included (ADR 0013).
  await requirePermission("team.hiring");
  const actor = await requireTeamMember();

  const [{ reqs, closedReqs, mySlots }, myDay] = await Promise.all([getTeamHiring(actor), getMyInterviewDay(actor)]);
  const { headline, sub } = heroLines(reqs, myDay);

  return (
    <div className="hr-page">
      <HiringFilter
        headline={headline}
        sub={sub}
        counts={{ roles: reqs.length, interviews: myDay.length, closed: closedReqs.length }}
        interviews={myDay.length > 0 ? <YourInterviews myDay={myDay} /> : null}
        roles={
          reqs.length === 0 ? (
            <section className="hr-card hr-sec">
              <p className="hr-note">No open roles right now. A role you are the hiring manager of shows here once Talent opens it.</p>
            </section>
          ) : (
            reqs.map((req) => (
              <RoleCard
                key={req.id}
                req={req}
                // The role's hiring manager (or an admin in the team view) gets the verbs; everyone else reads.
                actionsFor={
                  req.hiringManagerIsMe || actor.isAdmin
                    ? (row) => (
                        <CandidateActions
                          applicationId={row.applicationId}
                          canRequestBooking={req.loop.length > 0 ? row.cells.some((c) => c.status === "action") : row.atInterview && row.interviews.length === 0}
                          bookingRequested={Boolean(row.bookingRequestedAt)}
                        />
                      )
                    : null
                }
              />
            ))
          )
        }
        closed={closedReqs.length > 0 ? <ClosedRoles reqs={closedReqs} /> : null}
        rail={
          <>
            {mySlots.length > 0 && <YourLoops slots={mySlots} />}
            <HowHiringWorks />
          </>
        }
      />
    </div>
  );
}
