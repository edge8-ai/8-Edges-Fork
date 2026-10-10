import Link from "next/link";
import Image from "next/image";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getAssignedTeam } from "@/entities/portal/lib/team";
import { getAssignedTimeOff, getLeaveDecisionQueue } from "@/entities/portal/lib/time-off";
import { getInvoicesForActor } from "@/entities/portal/lib/invoices";
import { listWorkRequestsForActor } from "@/entities/portal/lib/client-work-requests";
import { getTokenUsage } from "@/entities/portal/lib/tokens";
import { getBacklogForActor } from "@/entities/portal/lib/backlog";
import { getWorkboardForClient } from "@/entities/portal/lib/boards";
import { listDocumentsForActor } from "@/entities/portal/lib/documents";
import { getMeetingsForActor } from "@/entities/portal/lib/meetings";
import { listPortalProgramSummaries } from "@/entities/portal/lib/program-hub";
import { getProposalsForActor } from "@/entities/portal/lib/proposals";
import { listAgreementsToSignForActor } from "@/entities/portal/lib/agreements";
import { contributorCompanyScope } from "@/entities/portal/lib/roles";
import { isStaffingOnlyClient } from "@/entities/portal/lib/profile";
import { EMPTY_USAGE, getDeliveredHoursSince } from "@/entities/portal/lib/hub-tokens";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatCents, formatDate, initials } from "@/kernel/ui/format";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { HubTokensStrip, ProgramDeliveryCard } from "@/entities/team";
import { MeetingsPanel } from "@/entities/crm";
import { portalDocumentRows } from "@/entities/portal/lib/document-rows";
import { ProgramDocuments } from "./programs/[id]/ProgramDocuments";
import { ExternalLink } from "@/kernel/ui/ExternalLink";

// Portal home, the client's Delivery page (layout A of the wireframes): the
// Human Tokens strip, then the AI Programs as wide cards (stats, Now items,
// cards shipped this week) with a rail of what needs the client, the Edge8
// people on the account and the quick actions. Every loader is bound to the
// actor's companyScope; this page adds composition, not data access.
// Plan: docs/plans/2026-09-07-portal-home-overhaul.md

const WEEK_DAYS = 7;

// Days are Saigon calendar dates, not the server's UTC date, so "out this
// week" and "today" match what the team in Vietnam calls today.
function isoDay(offsetDays = 0): string {
  return addDays(saigonToday(), offsetDays);
}

function timeOffRange(start: string, end: string, half: boolean): string {
  const label = start === end ? formatDate(start) : `${formatDate(start)} → ${formatDate(end)}`;
  return half ? `${label} · half day` : label;
}

// Weeks the balance lasts at the last four weeks' pace; null when nothing was
// delivered in that window (no pace to project from).
function runwayLabel(balanceTokens: number, hoursLast28d: number): string | null {
  if (hoursLast28d <= 0 || balanceTokens <= 0) return null;
  const weeks = balanceTokens / (hoursLast28d / 4);
  if (weeks < 1) return "Under a week left at your current pace";
  const n = Math.round(weeks);
  return `About ${n} week${n === 1 ? "" : "s"} left at your current pace`;
}

export default async function PortalHome() {
  const actor = await requirePortalPermission("surface.portal");
  const since = new Date(Date.now() - WEEK_DAYS * 86_400_000).toISOString();
  const today = isoDay(0);

  const [team, timeOff, leaveDecisions, invoices, requests, usage, items, board, documents, meetings, programs, hoursLast28d, proposals, staffingOnly, agreementsToSign] =
    await Promise.all([
      getAssignedTeam(actor),
      getAssignedTimeOff(actor),
      getLeaveDecisionQueue(actor),
      getInvoicesForActor(actor),
      listWorkRequestsForActor(actor),
      actor.companyScope.length > 0 ? getTokenUsage(actor) : Promise.resolve(EMPTY_USAGE),
      getBacklogForActor(actor),
      getWorkboardForClient(actor),
      listDocumentsForActor(actor),
      getMeetingsForActor(actor),
      listPortalProgramSummaries(actor),
      getDeliveredHoursSince(actor.companyScope, isoDay(-28)),
      getProposalsForActor(actor),
      isStaffingOnlyClient(actor),
      listAgreementsToSignForActor(actor),
    ]);

  const companies = actor.memberships.map((m) => m.companyName).filter(Boolean) as string[];
  const canCreate = contributorCompanyScope(actor).length > 0;
  const runway = runwayLabel(usage.balanceTokens, hoursLast28d);
  // Staffing clients buy people, not Human Tokens (companies.client_types).
  const usesHumanTokens = !staffingOnly;

  // ── Per program: Now items and cards moved to Done this week ────────────
  const programOfBoard = new Map(board.boards.map((b) => [b.id, b.ai_program_id]));
  const nowItems = (programId: string) =>
    items.filter(
      (i) => i.ai_program_id === programId && i.status !== "shipped" && (i.client_priority ?? i.edge8_priority) === "now",
    );
  const shippedCards = (programId: string) =>
    board.cards
      .filter((c) => c.status === "done" && (c.completed_at ?? "") >= since && c.board_id && programOfBoard.get(c.board_id) === programId)
      .sort((a, b) => ((a.completed_at ?? "") < (b.completed_at ?? "") ? 1 : -1));

  // ── Needs you ───────────────────────────────────────────────────────────
  const needsDecision = requests.filter((r) => r.status === "estimate_submitted" || r.status === "work_submitted");
  const openInvoices = invoices.filter((inv) => inv.balanceCents > 0);
  const waitingLane = board.lanes.find((l) => l.name.toLowerCase().includes("wait"));
  const waitingCards = waitingLane ? board.cards.filter((c) => c.laneId === waitingLane.id && !c.archived_at) : [];
  const needsCount = openInvoices.length + leaveDecisions.length + needsDecision.length + waitingCards.length;

  // ── Shared (company-wide) documents, and every meeting ──────────────────
  // Meetings are a company-level record: all of them show here, a tagged one
  // with its program name, and on its program page as well.
  const hasPrograms = programs.length > 0;
  const sharedDocs = hasPrograms ? documents.filter((d) => !d.programId) : documents;
  const sharedMeetings = meetings;

  // ── Team ────────────────────────────────────────────────────────────────
  const weekEnd = isoDay(7);
  const outThisWeek = timeOff.filter((e) => e.startDate <= weekEnd && e.endDate >= today);
  // Out now first, then what is coming; the full calendar is on /portal/time-off.
  const timeOffAhead = timeOff
    .filter((e) => e.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  return (
    <>
      <PageHead
        eyebrow="Client Portal"
        title={actor.greeting ? `Welcome, ${actor.greeting}` : "Welcome"}
        sub={companies.length > 0 ? companies.join(" · ") : undefined}
        action={
          canCreate ? (
            <Link href="/portal/programs/add" className="admin-btn admin-btn--primary">
              Add AI Program
            </Link>
          ) : undefined
        }
      />

      {usesHumanTokens && <HubTokensStrip usage={usage} />}
      {usesHumanTokens && runway && (
        <p className="admin-page-sub u-mt-0 u-mb-4">
          {runway}. <Link href="/portal/tokens">Buy tokens</Link>
        </p>
      )}

      <div className="u-grid-2-1">
        <div>
          <div className="admin-hub-band-head">
            <h2 className="admin-card-title">AI Programs</h2>
          </div>
          {programs.length === 0 ? (
            <div className="admin-card admin-section-card u-mb-4">
              <div className="admin-empty">No AI Programs yet. Start one with Add AI Program, or Edge8 sets one up with you.</div>
            </div>
          ) : (
            programs.map((p) => {
              const href = `/portal/programs/${p.id}`;
              return (
                <ProgramDeliveryCard
                  key={p.id}
                  name={p.name}
                  status={p.status}
                  roadmapDone={p.roadmapDone}
                  roadmapTotal={p.roadmapTotal}
                  hasRepo={p.hasRepo}
                  deliveredHours={p.deliveredHours}
                  prsMergedLast7d={p.prsMergedLast7d}
                  now={nowItems(p.id).map((i) => ({ id: i.id, title: i.title }))}
                  shipped={shippedCards(p.id).map((c) => ({ id: c.id, title: c.title, completedAt: c.completed_at }))}
                  href={href}
                  roadmapHref={`${href}?tab=roadmap`}
                  boardHref={`${href}?tab=boards`}
                />
              );
            })
          )}

          {(sharedDocs.length > 0 || sharedMeetings.length > 0) && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Documents and meetings</h2>
              {hasPrograms && <span className="admin-cell-muted u-sm">company-wide documents, every meeting</span>}
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              {sharedDocs.length > 0 && <ProgramDocuments documents={portalDocumentRows(sharedDocs, actor.email)} />}
              {sharedMeetings.length > 0 && (
                <div className={sharedDocs.length > 0 ? "u-mt-4" : ""}>
                  <MeetingsPanel meetings={sharedMeetings} detailBasePath="/portal/meetings" />
                </div>
              )}
            </div>
            </>
          )}
        </div>

        <div>
          {needsCount > 0 && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Needs you</h2>
            </div>
            <div className="admin-card admin-section-card admin-card--attention u-mb-4">
              <div className="admin-list">
                {openInvoices.map((inv) => {
                  const overdue = !!inv.dueDate && inv.dueDate.slice(0, 10) < today;
                  return (
                    <div className="admin-list-row" key={inv.id}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">Invoice {inv.docNumber || inv.id.slice(0, 8)}</div>
                        <div className="admin-list-sub">
                          {formatCents(inv.balanceCents, inv.currency)}{" "}
                          {overdue ? `overdue since ${formatDate(inv.dueDate)}` : inv.dueDate ? `due ${formatDate(inv.dueDate)}` : "outstanding"}
                        </div>
                      </div>
                      <div className="admin-list-aside">
                        {inv.paymentLink ? (
                          <a className="admin-btn admin-btn--sm admin-btn--primary" href={inv.paymentLink} target="_blank" rel="noreferrer">
                            Pay now
                          </a>
                        ) : (
                          <Link className="admin-btn admin-btn--sm" href="/portal/invoices">View</Link>
                        )}
                      </div>
                    </div>
                  );
                })}
                {leaveDecisions.map((r) => (
                  <Link className="admin-list-row u-link-plain" key={r.id} href="/portal/time-off">
                    <div className="admin-list-main">
                      <div className="admin-list-title">{r.name} requested time off</div>
                      <div className="admin-list-sub">{timeOffRange(r.startDate, r.endDate, r.isHalfDay)}</div>
                    </div>
                    <div className="admin-list-aside"><Badge tone="warn">Approve</Badge></div>
                  </Link>
                ))}
                {needsDecision.map((r) => (
                  <Link className="admin-list-row u-link-plain" key={r.id} href={`/portal/requests/${r.id}`}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{r.title}</div>
                      <div className="admin-list-sub">
                        {r.status === "estimate_submitted" ? "Estimate waiting for your approval" : "Work delivered, waiting for your review"}
                      </div>
                    </div>
                    <div className="admin-list-aside"><Badge tone="warn">Review</Badge></div>
                  </Link>
                ))}
                {waitingCards.map((c) => {
                  const pid = c.board_id ? programOfBoard.get(c.board_id) : null;
                  return (
                    <Link className="admin-list-row u-link-plain" key={c.id} href={pid ? `/portal/programs/${pid}?tab=boards` : "/portal"}>
                      <div className="admin-list-main">
                        <div className="admin-list-title">{c.title}</div>
                        <div className="admin-list-sub">Waiting on you</div>
                      </div>
                      <div className="admin-list-aside"><Badge tone="warn">Answer</Badge></div>
                    </Link>
                  );
                })}
              </div>
            </div>
            </>
          )}

          {agreementsToSign.length > 0 && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Agreement to sign</h2>
            </div>
            <div className="admin-card admin-section-card admin-card--attention u-mb-4">
              <div className="admin-list">
                {agreementsToSign.map((a) => (
                  <Link className="admin-list-row u-link-plain" key={a.id} href={`/portal/agreements/${a.id}`}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{a.header.title}</div>
                      <div className="admin-list-sub">Signed by Edge8, waiting for your signature</div>
                    </div>
                    <div className="admin-list-aside"><Badge tone="warn">Sign</Badge></div>
                  </Link>
                ))}
              </div>
            </div>
            </>
          )}

          {proposals.length > 0 && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Proposals</h2>
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              <div className="admin-list">
                {proposals.map((d) => (
                  <div className="admin-list-row" key={d.id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{d.title || "Proposal"}</div>
                      <div className="admin-list-sub">{formatDate(d.createdAt)}</div>
                    </div>
                    <div className="admin-list-aside">
                      <ExternalLink className="admin-btn admin-btn--sm" href={d.proposalUrl}>
                        Open
                      </ExternalLink>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </>
          )}

          {team.length > 0 && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Your Edge8 team</h2>
              <Link href="/portal/team" className="admin-cell-muted u-sm">All →</Link>
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              <div className="admin-list">
                {team.map((m) => {
                  const name = m.name;
                  // Matched on the member, never the name: two people can share one.
                  const away = outThisWeek.find((e) => e.teamMemberId === m.teamMemberId);
                  return (
                    <div className="admin-list-row" key={m.teamMemberId}>
                      <div className="admin-list-main u-row u-gap-3">
                        {m.avatarUrl ? (
                          <Image src={m.avatarUrl} alt="" width={36} height={36} className="admin-avatar" />
                        ) : (
                          <div className="admin-avatar admin-avatar--soft">{initials(name)}</div>
                        )}
                        <div>
                          <div className="admin-list-title">{name}</div>
                          <div className="admin-list-sub">
                            {m.roleTitle || m.positionTitle || "Edge8 team"}
                            {away && ` · away ${timeOffRange(away.startDate, away.endDate, away.isHalfDay)}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          )}

          {team.length > 0 && (
            <>
            <div className="admin-hub-band-head">
              <h2 className="admin-card-title">Time off</h2>
              <Link href="/portal/time-off" className="admin-cell-muted u-sm">All →</Link>
            </div>
            <div className="admin-card admin-section-card u-mb-4">
              {timeOffAhead.length === 0 ? (
                <div className="admin-empty admin-empty--tall">No one is out or scheduled to be.</div>
              ) : (
                <div className="admin-list">
                  {timeOffAhead.map((e) => (
                    <Link className="admin-list-row u-link-plain" key={e.id} href="/portal/time-off">
                      <div className="admin-list-main">
                        <div className="admin-list-title">{e.name}</div>
                        <div className="admin-list-sub">{timeOffRange(e.startDate, e.endDate, e.isHalfDay)}</div>
                      </div>
                      <div className="admin-list-aside">
                        {e.status === "requested" ? (
                          <Badge tone="warn">Pending</Badge>
                        ) : e.startDate <= today ? (
                          <Badge tone="ok">Out now</Badge>
                        ) : (
                          <Badge>Upcoming</Badge>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            </>
          )}

          <div className="admin-hub-band-head">
            <h2 className="admin-card-title">Quick actions</h2>
          </div>
          <div className="admin-card admin-section-card">
            <div className="u-stack u-gap-2">
              <Link href="/portal/requests/new" className="admin-btn admin-btn--primary">New project request</Link>
              {usesHumanTokens && <Link href="/portal/tokens" className="admin-btn">Buy tokens</Link>}
              <Link href="/portal/requests/hire" className="admin-btn">Full-time hire estimate</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
