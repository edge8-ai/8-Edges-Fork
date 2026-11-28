import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { canDecideProbation } from "./actions";
import { ProbationDecision } from "./ProbationDecision";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Probation decision",
  description: "Record a probation decision.",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = NamedPerson;

// /team/probation/[id] — the auth-gated home for a manager's probation
// decision, replacing the old public probation-45 survey. Only the subject's
// manager, an admin, or the talent director may load it. The manager arrives
// here from the onboarding-cycle reminder email.
export default async function ProbationDecisionPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.performance");
  const params = await props.params;
  if (!UUID_RE.test(params.id)) notFound();
  const actor = await requireTeamMember();

  const { data: subject, error: subjectError } = await companyOs
    .from("team_members")
    .select(
      `id, manager_id, employment_stage, status, probation_ends_on, start_date, positions!position_id(title), people!person_id(${NAME_COLUMNS})`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (subjectError) console.error("[team/probation] team_members", subjectError);
  if (!subject) notFound();

  const allowed = await canDecideProbation(actor, subject.manager_id as string | null);
  if (!allowed) notFound();

  const p = (Array.isArray(subject.people) ? subject.people[0] : subject.people) as Person | null;
  const name = personName(p, "Team member");
  const pos = (Array.isArray(subject.positions) ? subject.positions[0] : subject.positions) as
    | { title: string | null }
    | null;
  const stage = subject.employment_stage as string | null;
  const onProbation = stage === "probation" || subject.status === "pre_start";

  return (
    <>
      <PageHead
        eyebrow={<Link href="/team">← Team</Link>}
        title={`Probation decision: ${name}`}
        sub={[pos?.title, subject.probation_ends_on ? `Probation ends ${formatDate(subject.probation_ends_on)}` : null]
          .filter(Boolean)
          .join(" · ")}
      />

      {!onProbation ? (
        <div className="admin-card u-p-4">
          <p className="u-m-0">
            {name} is no longer on probation
            {stage ? (
              <>
                {" "}
                (<Badge>{humanize(stage)}</Badge>)
              </>
            ) : null}
            . No decision is needed.
          </p>
        </div>
      ) : (
        <div className="admin-card u-p-4 u-max-form">
          <div className="admin-card-title">Record your decision</div>
          <p className="admin-hint u-mt-0">
            One decision, applied immediately. An extension moves the dates; a full-time offer promotes them when
            probation ends.
          </p>
          <ProbationDecision subjectId={subject.id as string} subjectName={name} />
        </div>
      )}
    </>
  );
}
