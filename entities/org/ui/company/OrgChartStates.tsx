import Link from "next/link";

// The org chart's two honest states. Before the 2026-10-08 redesign a failed
// read and an empty company both drew "0 people" over a blank chart.

export function OrgChartUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div className="admin-org-state" role="alert">
      <h2>The chart didn&apos;t load</h2>
      <p>The directory didn&apos;t answer, so we can&apos;t show who reports to whom right now. Nothing changed in anyone&apos;s record.</p>
      <div>
        <Link className="admin-org-btn" href={retryHref} prefetch={false}>
          Try again
        </Link>
      </div>
    </div>
  );
}

export function OrgChartEmpty({ talentHref }: { talentHref?: string }) {
  return (
    <div className="admin-org-state">
      <h2>No one is on the chart yet</h2>
      <p>People appear here once they are active in Talent, with a manager or at the top of the company.</p>
      {talentHref && (
        <div>
          <Link className="admin-org-btn" href={talentHref}>
            Open Talent
          </Link>
        </div>
      )}
    </div>
  );
}
