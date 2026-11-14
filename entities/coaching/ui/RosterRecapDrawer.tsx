"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { lastRecapForRow } from "@/entities/coaching/lib/row-bar-actions";
import type { LastRecapView } from "@/entities/coaching/lib/row-actions";
import { describeDay } from "@/entities/coaching/lib/cadence";

// The last recap, fetched when the drawer opens rather than with the roster: a
// recap body is long prose and at most one of them is ever read on this page.
export function RecapDrawer({ profileId, name, onClose }: { profileId: string; name: string; onClose: () => void }) {
  const [state, setState] = useState<{ recap: LastRecapView } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    lastRecapForRow(profileId)
      .then((res) => {
        if (live) setState(res.ok ? { recap: res.recap } : { error: res.error });
      })
      // A drawer that fails to load must say so rather than sit on "Loading…":
      // the coach opened it 90 seconds before a 1-1 and needs to know to look
      // somewhere else, not to keep waiting.
      .catch(() => {
        if (live) setState({ error: "That recap could not be loaded." });
      });
    return () => {
      live = false;
    };
  }, [profileId]);

  const heldOn = state && "recap" in state ? state.recap.heldOn : null;

  return (
    <DetailDrawer
      open
      onClose={onClose}
      eyebrow="Last recap"
      title={heldOn ? `1-1 on ${describeDay(heldOn)}` : name}
      action={
        <Link href={`/team/coaching/${profileId}?tab=log`} className="admin-btn admin-btn--sm">
          Open the log
        </Link>
      }
    >
      {state === null && <p className="admin-cell-muted">Loading…</p>}
      {state && "error" in state && <p className="admin-cell-muted">{state.error}</p>}
      {state && "recap" in state && state.recap.html === null && (
        <p className="admin-cell-muted">That 1-1 was held but never written up.</p>
      )}
      {state && "recap" in state && state.recap.html !== null && (
        // The HTML is remark output sanitized on the server (lib/markdown.ts),
        // which is the same path every other coaching document takes.
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: state.recap.html }} />
      )}
    </DetailDrawer>
  );
}
