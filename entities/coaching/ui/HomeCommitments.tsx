import Link from "next/link";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { getAllMyCommitmentRows } from "../lib/data/my-commitment-rows";
import { COMMITMENT_ROW_ATOMS, newestOpenOwned } from "../lib/commitment-groups";
import { getAccess } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { CommitmentRowList } from "./CommitmentRowList";

const COMMITMENTS_TAB = "/team/my-coaching?tab=commitments";

// Home's commitments block (L.18.3): the three newest open promises the reader
// owns, as a coachee or as a coach, each with Done, and the way to the tab.
// Nothing at all for someone with none: an empty card on Home is noise.
export async function HomeCommitments({ actor }: { actor: TeamActor }) {
  const [all, access] = await Promise.all([getAllMyCommitmentRows(actor), getAccess()]);
  const rows = newestOpenOwned(all);
  if (rows.length === 0) return null;
  return (
    <section className="th-card" aria-labelledby="th-commitments-h">
      <div className="th-card-h">
        <h2 id="th-commitments-h">Your commitments</h2>
        <Link href={COMMITMENTS_TAB}>All commitments →</Link>
      </div>
      <CommitmentRowList rows={rows} actions="done" quiet may={mayProp(access, COMMITMENT_ROW_ATOMS)} />
    </section>
  );
}
