import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import type { MayProp } from "@/kernel/identity/may-prop";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import type { ProposalReview as Review } from "@/entities/crm/lib/proposal-view";
import { STEP_WORDS } from "@/entities/crm/lib/proposal-types";
import { ProposalBody } from "./ProposalBody";
import { ProposalCrmChanges } from "./ProposalCrmChanges";
import { ProposalDecision } from "./ProposalDecision";
import { ProposalSections } from "./ProposalSections";

// The proposal review page's body (Z.10), a server component over plain data:
// the proposal as the client will read it, and beside it the decision, the
// checks and the CRM changes. The page guards and loads; this draws, so the
// same drawing can be checked with fixture data.
export function ProposalReview({ review, may }: { review: Review; may: MayProp }) {
  const { run } = review;
  const waiting = run.mode === "live" && (run.step === "ready" || run.step === "publish");
  const version = review.approval?.currentVersion ?? run.version;
  const facts = [
    { label: "Version you would approve", value: version ? `${version} (an edit needs a new approval)` : "Not drafted yet" },
    { label: "Where it goes", value: review.plannedUrl ? `${review.plannedUrl}, and the list in ${review.companyName}'s portal` : "Decided when it is drafted" },
    { label: "Value", value: review.total ?? "Not priced yet" },
    { label: "Waits on", value: "The Revenue approver role" },
    { label: "If nobody decides", value: "It waits. A priced proposal is never approved on a timeout." },
  ];
  const checks = [
    ...review.flags.map((f) => ({ tone: "info" as const, text: `Line ${f.line} was treated as speech, not instructions (${f.kind}): "${f.excerpt}"` })),
    ...(review.truncated ? [{ tone: "warn" as const, text: "The transcript was longer than the chain reads; the end was cut before the model saw it." }] : []),
    ...review.priorProposals.map((url) => ({ tone: "warn" as const, text: `This company already has a proposal: ${url}. Check this is not the same call twice.` })),
    ...review.lint.filter((f) => !review.sections.some((s) => s.warnings.includes(f.text))).map((f) => ({ tone: f.tone, text: f.text })),
  ];

  return (
    <div className="admin-content">
      <div className="u-mb-3">
        {review.meetingId ? (
          <Link className="admin-cell-muted" href={`/admin/revenue/meetings/${review.meetingId}`}>
            ← {review.meetingTitle ?? "The sales call"}
          </Link>
        ) : (
          <Link className="admin-cell-muted" href="/admin/revenue/meetings">
            ← All client meetings
          </Link>
        )}
      </div>

      <PageHead
        eyebrow="Revenue · Proposal"
        title={review.headline ?? `Proposal for ${review.companyName}`}
        sub={
          run.mode === "shadow"
            ? "A shadow draft from the call: read it beside the proposal made by hand. It was never sent for approval."
            : "Drafted by the proposal chain from the call. Read it as the client will, change what is wrong, then decide. An edit needs a new approval."
        }
        action={<Badge tone={run.step === "stopped" ? "err" : run.step === "done" ? "ok" : "info"}>{STEP_WORDS[run.step]}</Badge>}
      />

      {run.step === "stopped" && <div className="admin-alert admin-alert--warn u-mb-3">Stopped: {run.error ?? "no reason recorded."}{/nothing was/i.test(run.error ?? "") ? "" : " Nothing was sent or published."}</div>}

      <div className="admin-record-cols admin-record-cols--rail-first">
        {review.sections.length > 0 ? (
          <div className="admin-record-main">
            {review.sub && (
              <div className="admin-card admin-section-card">
                <div className="admin-shelf-heading">For {review.companyName}</div>
                <ProposalBody body={review.sub} />
              </div>
            )}
            <ProposalSections id={run.id} version={version} sections={review.sections} lineItems={review.lineItems} total={review.total} editable={waiting} may={may} />
          </div>
        ) : (
          <div className="admin-record-main">
            <div className="admin-card admin-section-card admin-cell-muted">{STEP_WORDS[run.step]}. The proposal appears here once the draft step has run.</div>
          </div>
        )}

        <div className="admin-record-rail">
          <ProposalDecision
            id={run.id}
            step={run.step}
            mode={run.mode}
            version={version}
            pendingVersion={review.approval?.pendingVersion ?? null}
            publishedUrl={run.publishedUrl}
            facts={facts}
            may={may}
          />
          {checks.length > 0 && (
            <div className="admin-card admin-section-card">
              <div className="admin-card-title admin-card-title--compact">Checks before you decide</div>
              {checks.map((c) => (
                <div key={c.text} className={`admin-alert admin-alert--${c.tone} u-mt-2 u-sm`}>
                  {c.text}
                </div>
              ))}
            </div>
          )}
          {run.mode === "live" && <ProposalCrmChanges id={run.id} parts={review.crmParts} applied={review.crmApplied} may={may} />}
        </div>
      </div>
    </div>
  );
}
