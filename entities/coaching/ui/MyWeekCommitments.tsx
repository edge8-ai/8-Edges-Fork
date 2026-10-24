import Link from "next/link";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getAllMyCommitmentRows, myCommitmentBoards } from "../lib/data/my-commitment-rows";
import { COMMITMENT_ROW_ATOMS, myWeekRows } from "../lib/commitment-groups";
import { getAccess } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { CommitmentRowList } from "./CommitmentRowList";

// Commitments on My Week (L.18.3), through the MyWeekCommitments page slot:
// boards may not import coaching (coaching requires boards, and the entity
// graph is a DAG), so app/shell.ts hands this to the boards page when coaching
// is installed. The open promises the reader owns, those due in the sprint
// window first; one already on the Workboard is left out, because My Week
// lists its card. The reader is resolved here from the session, never passed
// in, so the slot cannot be asked for somebody else's promises.
export async function MyWeekCommitments({ startsOn, endsOn }: { startsOn: string; endsOn: string }) {
  const actor = await requireTeamMember();
  const [all, boards, access] = await Promise.all([getAllMyCommitmentRows(actor), myCommitmentBoards(actor), getAccess()]);
  const rows = myWeekRows(all, { startsOn, endsOn });
  if (rows.length === 0) return null;
  return (
    <section className="admin-myweek-section" id="my-week-commitments" aria-labelledby="my-week-commitments-h">
      <h2 className="admin-myweek-h" id="my-week-commitments-h">
        Commitments
        <span className="admin-myweek-count">{rows.length}</span>
      </h2>
      <p className="admin-myweek-hint">
        Promises from 1-1s, due this sprint first. <Link href="/team/my-coaching?tab=commitments">All commitments</Link>
      </p>
      <CommitmentRowList rows={rows} boards={boards} may={mayProp(access, COMMITMENT_ROW_ATOMS)} />
    </section>
  );
}
