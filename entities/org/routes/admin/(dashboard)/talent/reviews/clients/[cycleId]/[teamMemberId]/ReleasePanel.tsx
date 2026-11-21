"use client";

import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { releaseAction, waiveMarkAction } from "../owner-actions";

// Where the release of one member's review stands, and the two steps that move
// it (CR.3.3, stories 51 and 52), as the CR.3.1 prototype drew them. Release
// waits for the client manager's part and the skip-manager's Reviewed mark;
// the mark can be waived for this one member, and the waiver is recorded. The
// page offers what ./owner-rules allows and the commands refuse the rest.
export function ReleasePanel({
  may,
  cycleId,
  teamMemberId,
  memberName,
  managerName,
  clientManagerName,
  skipManagerName,
  clientManagerSentAt,
  skipMarkedAt,
  skipWaivedAt,
  releasedAt,
  hasSkipManager,
  canWaive,
  canRelease,
}: {
  may: MayProp;
  cycleId: string;
  teamMemberId: string;
  memberName: string;
  managerName: string | null;
  clientManagerName: string | null;
  skipManagerName: string | null;
  clientManagerSentAt: string | null;
  skipMarkedAt: string | null;
  skipWaivedAt: string | null;
  releasedAt: string | null;
  hasSkipManager: boolean;
  canWaive: boolean;
  canRelease: boolean;
}) {
  const router = useRouter();
  const allowed = may["org.reviews"];
  const cm = clientManagerName ?? "The client manager";
  const skip = skipManagerName ?? "The skip-manager";
  const readers = managerName ? `${memberName} and their manager of record, ${managerName}` : memberName;

  return (
    <section className="admin-card u-p-4" aria-labelledby="cr-release">
      <h2 id="cr-release" className="admin-card-title admin-card-title--tight">
        Release
      </h2>
      {releasedAt ? (
        <p className="admin-alert admin-alert--ok u-m-0" role="status">
          Released {formatDate(releasedAt)}. {memberName} reads it under Reviews in the team app.
        </p>
      ) : (
        <>
          <p className="admin-hint u-mt-0">Release waits for both of these.</p>
          <div className="u-stack u-gap-2">
            <div className="u-row u-gap-2">
              <Badge tone={clientManagerSentAt ? "ok" : "warn"}>{clientManagerSentAt ? "Done" : "Waiting"}</Badge>
              <span>
                {clientManagerSentAt ? `${cm} sent their part ${formatDate(clientManagerSentAt)}` : `${cm} has not sent their part`}
              </span>
            </div>
            <div className="u-row u-gap-2">
              {!hasSkipManager ? (
                <>
                  <Badge tone="ok">None</Badge>
                  <span>This cycle has no skip-manager</span>
                </>
              ) : skipMarkedAt ? (
                <>
                  <Badge tone="ok">Done</Badge>
                  <span>{`${skip} marked it reviewed ${formatDate(skipMarkedAt)}`}</span>
                </>
              ) : skipWaivedAt ? (
                <>
                  <Badge tone="ok">Waived</Badge>
                  <span>{`${skip}'s mark waived ${formatDate(skipWaivedAt)}, recorded`}</span>
                </>
              ) : (
                <>
                  <Badge tone="warn">Waiting</Badge>
                  <span>{`${skip} marks it reviewed`}</span>
                </>
              )}
            </div>
          </div>
          {allowed && canWaive && (
            <div className="admin-divider-top">
              <ConfirmButton
                className="admin-btn admin-btn--sm"
                label={`Waive ${skip}'s mark…`}
                title={`Release ${memberName}'s review without ${skip}'s Reviewed mark?`}
                body={`This is for ${memberName} only, and it is recorded with your name. ${skip} can still add notes until they mark it or the cycle closes.`}
                confirmLabel={`Waive for ${memberName}`}
                onConfirm={() => waiveMarkAction({ cycleId, teamMemberId })}
                onDone={() => router.refresh()}
              />
            </div>
          )}
          {allowed && (
            <div className="u-mt-3">
              <ConfirmButton
                className="admin-btn admin-btn--primary"
                label={`Release ${memberName}'s review…`}
                title={`Release ${memberName}'s review?`}
                body={`From now on ${readers} can read ${cm}'s ratings and comments, both averages and your HR summary, and so can their coach if they have one. ${skip}'s notes stay with the review admins. There is no undo: a release stays released.`}
                confirmLabel="Release now"
                disabled={!canRelease}
                onConfirm={() => releaseAction({ cycleId, teamMemberId })}
                onDone={() => router.refresh()}
              />
              {!canRelease && <p className="admin-hint u-mt-2 u-mb-0">Opens once both of these are done, or once you waive the mark.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
