import { formatDate } from "@/kernel/ui/format";
import type { OwnerMemberPage } from "@/entities/org/lib/client-reviews/member-page";
import type { AnswerBeside } from "@/entities/org/lib/client-reviews/beside";

// One member's client review on paper (CR.3.4, story 59), as the CR.3.4
// prototype was approved: the names and dates, both averages, every question
// with both parts, and the HR summary, for handing to someone who is not in
// the app. It is hidden on screen and is the only thing printed. The
// skip-manager's notes are never on it: paper leaves the app, and the notes
// are for HR only (story 55).

type Page = Extract<OwnerMemberPage, { kind: "page" }>;

const average = (n: number | null) => (n === null ? "—" : n.toFixed(2));

/** An answer as one printed cell: the rating or choice, then the words. */
function Answer({ answer }: { answer: AnswerBeside | null }) {
  if (!answer) return <span className="cr-print-muted">Not answered</span>;
  const head = answer.rating !== null ? String(answer.rating) : answer.choice;
  return (
    <>
      {head && <b>{head}</b>}
      {head && answer.text ? " · " : ""}
      {answer.text}
    </>
  );
}

export function PrintSheet({ page, printedOn }: { page: Page; printedOn: string }) {
  const first = page.member.name;
  const cm = page.clientManagerName ?? "The client manager";
  return (
    <div className="cr-print">
      {/* Divs, not header and footer: the site's bare header and footer rules would restyle them on paper. */}
      <div className="cr-print-head">
        <div>
          <p className="cr-print-k">
            Client review · {page.cycle.clientName ? `${page.cycle.clientName} · ` : ""}
            {page.cycle.name}
          </p>
          <h1 className="cr-print-name">{first}</h1>
          <p className="cr-print-sub">
            {[page.clientManagerName ? `Client manager ${page.clientManagerName}` : null, page.member.managerName ? `manager of record ${page.member.managerName}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="cr-print-dates">
          <p>{page.releasedAt ? <><b>Released</b> {formatDate(page.releasedAt)}</> : <b>Not released</b>}</p>
          <p>
            {[page.memberSentAt ? `${first} sent ${formatDate(page.memberSentAt)}` : `${first} has not sent`, page.clientManagerSentAt ? `${cm} sent ${formatDate(page.clientManagerSentAt)}` : `${cm} has not sent`].join(" · ")}
          </p>
        </div>
      </div>
      <div className="cr-print-figures">
        <div>
          <p>{first}&apos;s own average</p>
          <b>{average(page.selfAverage)}</b>
        </div>
        <div>
          <p>{cm}&apos;s average</p>
          <b>{average(page.clientManagerAverage)}</b>
        </div>
        <div>
          <p>Rated differently</p>
          <b>{page.ratedDifferently === null ? "—" : `${page.ratedDifferently} of ${page.rows.filter((r) => r.member?.rating != null && r.clientManager?.rating != null).length}`}</b>
        </div>
      </div>
      <table className="cr-print-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>{first}</th>
            <th>{cm}</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.title}</th>
              <td>
                <Answer answer={r.member} />
              </td>
              <td>
                <Answer answer={r.clientManager} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.summary.trim() && (
        <section className="cr-print-summary">
          <p className="cr-print-k">HR summary</p>
          <p>{page.summary}</p>
        </section>
      )}
      <div className="cr-print-foot">
        <span>Printed {formatDate(printedOn)} · Confidential · The skip-manager&apos;s notes are not printed.</span>
      </div>
    </div>
  );
}
