"use client";
// Close these deals (RT.1): the open deals that need a move today, closest to
// signing first, each with the moves that close it. Logged asks for the next
// step and its date; Snooze moves the date three days on; Won asks the final
// amount and Lost a reason, because the stage move refuses either without
// them. The route hands the two actions in, and each asks crm.pipeline itself.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// SurfaceLink keeps a deal title on the reader's surface: /team/revenue for a
// Revenue holder without Admin, who could not open the /admin deal page.
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { Badge } from "@/kernel/ui/Badge";
import { dealPath } from "@/kernel/config/slug";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { CloseDeal } from "@/entities/crm/lib/revenue-metrics/overview";

type Result = { ok: true } | { ok: false; error: string };
export type CloseDealActions = {
  logFollowUp: (dealId: string, nextStep: string | null, date: string) => Promise<Result>;
  moveDealStage: (dealId: string, toStageId: string, lostReason?: string, wonAmount?: number) => Promise<Result>;
};
type Ask = "logged" | "won" | "lost";

const REASONS: [string, string][] = [
  ["ghosted", "Went quiet"],
  ["no_decision", "No decision"],
  ["bad_timing", "Bad timing"],
  ["price", "Price"],
  ["competitor", "Chose someone else"],
  ["bad_fit", "Not a fit"],
  ["other", "Other"],
];

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function badge(d: CloseDeal) {
  if (d.reason === "late") return <Badge tone="err">{plural(d.lateDays, "day")} late</Badge>;
  if (d.reason === "today") return <Badge tone="warn">Today</Badge>;
  return <Badge tone="warn">{d.reason === "no-date" ? "No date" : "No next step"}</Badge>;
}

function DealRow({ d, actions, today, wonStageId, lostStageId, may }: { d: CloseDeal; actions: CloseDealActions; today: string; wonStageId: string | null; lostStageId: string | null; may: MayProp }) {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [done, setDone] = useState<{ msg: string; undo: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(d.nextStep ?? "");
  const [date, setDate] = useState(plusDays(today, 7));
  // Not prefilled: the figure shown is in US dollars, and the deal may be priced in another currency.
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("ghosted");
  const canAct = Boolean(may["crm.pipeline"]);

  // A done row stays a moment, so Undo can be reached, then the page redraws without it.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.refresh(), 5000);
    return () => clearTimeout(t);
  }, [done, router]);

  async function run(write: () => Promise<Result>, msg: string, undo = false) {
    setBusy(true);
    setErr(null);
    const res = await write().catch(() => ({ ok: false as const, error: "That didn't go through. Open the deal and try there." }));
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setAsk(null);
    setDone({ msg, undo });
  }

  async function undo() {
    setBusy(true);
    const res = await actions.logFollowUp(d.id, d.nextStep, d.nextStepDate ?? today).catch(() => ({ ok: false as const, error: "Undo didn't go through." }));
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setDone(null);
    router.refresh();
  }

  return (
    <div className={`admin-list-row admin-home-act${done ? " admin-home-act--done" : ""}`}>
      <span className="admin-list-main">
        <Link href={dealPath(d.title, d.id)} className="admin-list-title admin-home-title-link">
          {d.title}
        </Link>
        <span className="admin-list-sub">{[d.usd ? usd(d.usd) : null, d.stage, d.nextStep].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="admin-home-acts">
        {!done && badge(d)}
        {done ? (
          <>
            <span className="admin-home-msg" role="status">
              {done.msg}
            </span>
            {done.undo && (
              <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={undo}>
                Undo
              </button>
            )}
          </>
        ) : (
          canAct &&
          !ask && (
            <>
              <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={busy} onClick={() => setAsk("logged")}>
                Logged
              </button>
              {d.nextStep && (
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run(() => actions.logFollowUp(d.id, d.nextStep, plusDays(today, 3)), "Snoozed 3 days", true)}>
                  Snooze
                </button>
              )}
              {wonStageId && (
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setAsk("won")}>
                  Won
                </button>
              )}
              {lostStageId && (
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setAsk("lost")}>
                  Lost
                </button>
              )}
            </>
          )
        )}
      </span>
      {err && (
        <p className="admin-home-err" role="alert">
          {err}
        </p>
      )}
      {ask && (
        <form
          className="admin-home-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (ask === "logged") void run(() => actions.logFollowUp(d.id, step.trim() || null, date), "Follow-up logged", true);
            if (ask === "won" && wonStageId) void run(() => actions.moveDealStage(d.id, wonStageId, undefined, Number(amount)), "Won");
            if (ask === "lost" && lostStageId) void run(() => actions.moveDealStage(d.id, lostStageId, reason), "Marked lost");
          }}
        >
          {ask === "logged" && (
            <>
              <input className="admin-input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Next step" aria-label="Next step" required autoFocus />
              <input className="admin-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Next step date" required />
            </>
          )}
          {ask === "won" && (
            <>
              <span className="admin-home-ask-prompt">Final amount, in the deal&rsquo;s currency</span>
              <input className="admin-input" type="number" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Final amount" required autoFocus />
            </>
          )}
          {ask === "lost" && (
            <>
              <span className="admin-home-ask-prompt">Why was it lost?</span>
              <select className="admin-select" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lost reason">
                {REASONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={busy}>
            {ask === "logged" ? "Save" : ask === "won" ? "Mark won" : "Mark lost"}
          </button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setAsk(null)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

export function CloseDealsList(props: { deals: CloseDeal[]; actions: CloseDealActions; today: string; wonStageId: string | null; lostStageId: string | null; may: MayProp }) {
  const { deals, ...rest } = props;
  if (deals.length === 0) return <p className="admin-home-quiet">Every open deal has a dated next step still ahead. Nothing to chase today.</p>;
  return (
    <div className="admin-list">
      {deals.map((d) => (
        <DealRow key={d.id} d={d} {...rest} />
      ))}
    </div>
  );
}
