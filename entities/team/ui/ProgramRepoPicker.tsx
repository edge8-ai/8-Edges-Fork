import Link from "next/link";
import { mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";
import type { ProgramRepo } from "@/entities/team/lib/hub-program";

// Which of a program's repos the per-repo tools below it show (X.1). The hours
// ledger edits one repo's days and the sessions and story are per repo, while
// the figures above them are summed over every repo. A wrapping row of chips,
// so a modular monolith with a repo per component still reads; a one-repo
// program renders nothing and its page is unchanged.
export function ProgramRepoPicker({
  repos,
  selectedId,
  basePath,
  searchParams,
}: {
  repos: ProgramRepo[];
  selectedId: string | null;
  basePath: string;
  searchParams: SearchParamsObj;
}) {
  if (repos.length < 2) return null;
  return (
    // A div with the navigation role rather than a <nav>, so no rule written
    // for the public site's header can reach it: one did, and pinned these
    // chips in a blurred strip over the top of the screen (M2.12).
    <div className="admin-chiplist u-mb-3" role="navigation" aria-label="Repo">
      {repos.map((r) => {
        const active = r.id === selectedId;
        return (
          <Link
            key={r.id}
            href={`${basePath}${mergeQuery(searchParams, { tab: "tokens", repo: r.id })}`}
            className={active ? "admin-chip is-active" : "admin-chip"}
            aria-current={active ? "page" : undefined}
          >
            {r.githubRepo ?? r.name}
          </Link>
        );
      })}
    </div>
  );
}
