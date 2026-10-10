import { requirePermission } from "@/kernel/identity/access-request";
import { notFound, redirect } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getReportingSubtreeIds } from "@/kernel/identity/org-tree";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { getPlanMarkdown, isMarkdownPlan, signedPlanUrl } from "@/entities/onboarding/lib/cycle";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";
import { externalHref } from "@/kernel/ui/url";
import { NAME_ONLY_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = { title: "Onboarding plan" };

// In-app view of a journey's onboarding plan. The person reads their own; a
// manager reads any journey in their reporting subtree, the same scope the
// board on /team/onboarding lists and its actions write (actor.teamMemberScope
// stops at direct reports, so a hire two levels down showed on the board but
// 404'd here). Markdown renders right here; any other file type redirects to
// a short-lived signed URL; a link-plan redirects to the link.
export default async function TeamPlanViewPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("onboarding.mine");
  const params = await props.params;
  const actor = await requireTeamMember();

  const { data, error: planError } = await companyOs
    .from("onboarding_plans")
    .select(
      `id, team_member_id, plan_url, plan_path, team_members:team_members!team_member_id(people:people!person_id(${NAME_ONLY_COLUMNS}))`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (planError) console.error("[team/onboarding] onboarding_plans", planError);
  if (!data) notFound();

  const row = data as unknown as {
    team_member_id: string | null;
    plan_url: string | null;
    plan_path: string | null;
    team_members:
      | { people: NamedPerson | NamedPerson[] | null }
      | { people: NamedPerson | NamedPerson[] | null }[]
      | null;
  };

  const own = row.team_member_id === actor.teamMemberId;
  if (!own) {
    if (actor.role !== "manager" || !row.team_member_id) notFound();
    const subtree = await getReportingSubtreeIds(actor.teamMemberId);
    if (!subtree.includes(row.team_member_id)) notFound();
  }

  // A stored link is followed only when it is one; a row written before the
  // writer checked it falls through to the uploaded file, or to not found.
  const planHref = externalHref(row.plan_url);
  if (planHref) redirect(planHref);
  if (!row.plan_path) notFound();

  if (!isMarkdownPlan(row.plan_path)) {
    const url = await signedPlanUrl(row.plan_path);
    if (!url) notFound();
    redirect(url);
  }

  const markdown = await getPlanMarkdown(row.plan_path);
  if (!markdown) notFound();
  const html = await renderPlanMarkdown(markdown);

  const tm = Array.isArray(row.team_members) ? row.team_members[0] : row.team_members;
  const person = Array.isArray(tm?.people) ? tm?.people[0] : tm?.people;
  const name = personName(person, "team member");

  return (
    <>
      <PageHead eyebrow="Onboarding" title={`${name}'s onboarding plan`} sub="The plan their manager laid out for the first 180 days" />
      <div className="admin-card admin-content u-p-5">
        <div className="admin-plan-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
