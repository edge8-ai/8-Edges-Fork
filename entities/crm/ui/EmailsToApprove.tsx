"use client";
// Personal emails to approve (RT.1): the drafts waiting for a yes, with the
// subject and a preview, and Approve or Skip in place. Edit opens the agent's
// queue, where the whole message can be rewritten. Nothing sends without the
// yes. The route hands the campaigns entity's two actions in as props, and
// each asks campaigns.marketing itself; the buttons show only to a reader the
// route found may see the drafts (lib/revenue-today.ts).
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MayProp } from "@/kernel/identity/may-prop";
import { maySeeEmailDrafts } from "@/entities/crm/lib/revenue-today";

type Result = { ok: true } | { ok: false; error: string };
export type EmailToApprove = { id: string; agentId: string; agentName: string | null; recipient: string | null; subject: string; preview: string; held: string | null };
export type EmailActions = { approve: (id: string) => Promise<Result>; skip: (id: string) => Promise<Result> };

function EmailRow({ e, actions, may }: { e: EmailToApprove; actions: EmailActions; may: MayProp }) {
  const router = useRouter();
  const [state, setState] = useState<{ t: "idle" | "busy" } | { t: "done"; msg: string } | { t: "err"; msg: string }>({ t: "idle" });
  const edit = `/admin/revenue/marketing/personal/${e.agentId}`;
  async function go(write: () => Promise<Result>, msg: string) {
    setState({ t: "busy" });
    const res = await write().catch(() => ({ ok: false as const, error: "That didn't go through. Open the queue and try there." }));
    setState(res.ok ? { t: "done", msg } : { t: "err", msg: res.error });
    if (res.ok) setTimeout(() => router.refresh(), 2500);
  }
  return (
    <div className={`admin-list-row admin-home-act${state.t === "done" ? " admin-home-act--done" : ""}`}>
      <span className="admin-list-main">
        <Link href={edit} className="admin-list-title admin-home-title-link">
          {e.subject || "(no subject)"}
        </Link>
        <span className="admin-list-sub">{[e.recipient ? `To ${e.recipient}` : null, e.agentName, e.held ? `held: ${e.held}` : null].filter(Boolean).join(" · ")}</span>
        <span className="admin-list-sub rt-preview">{e.preview}</span>
      </span>
      <span className="admin-home-acts">
        {state.t === "done" ? (
          <span className="admin-home-msg" role="status">
            {state.msg}
          </span>
        ) : (
          maySeeEmailDrafts(may) && (
            <>
              <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={state.t === "busy"} onClick={() => go(() => actions.approve(e.id), "Approved, it sends on schedule")}>
                Approve
              </button>
              <Link href={edit} className="admin-btn admin-btn--sm">
                Edit
              </Link>
              <button type="button" className="admin-btn admin-btn--sm" disabled={state.t === "busy"} onClick={() => go(() => actions.skip(e.id), "Skipped")}>
                Skip
              </button>
            </>
          )
        )}
      </span>
      {state.t === "err" && (
        <p className="admin-home-err" role="alert">
          {state.msg}
        </p>
      )}
    </div>
  );
}

export function EmailsToApprove({ emails, actions, may }: { emails: EmailToApprove[]; actions: EmailActions; may: MayProp }) {
  if (emails.length === 0) return <p className="admin-home-quiet">No personal email is waiting for your yes.</p>;
  return (
    <div className="admin-list">
      {emails.map((e) => (
        <EmailRow key={e.id} e={e} actions={actions} may={may} />
      ))}
    </div>
  );
}
