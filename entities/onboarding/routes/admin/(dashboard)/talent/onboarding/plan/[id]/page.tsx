import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { getPlanMarkdown, isMarkdownPlan, signedPlanUrl } from "@/entities/onboarding";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";
import { one } from "@/kernel/config/embedded";
import { externalHref } from "@/kernel/ui/url";
import { NAME_ONLY_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = { title: "Onboarding plan" };

// Admin mirror of the scoped viewer at /team/onboarding/plan/[id]: markdown
// renders in-app, other file types redirect to a short-lived signed URL, a
// link-plan redirects to the link.
export default async function AdminPlanViewPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("onboarding.manage");
  const params = await props.params;

  const { data, error } = await companyOs
    .from("onboarding_plans")
    .select(
      `id, plan_url, plan_path, team_members:team_members!team_member_id(people:people!person_id(${NAME_ONLY_COLUMNS}))`,
    )
    .eq("id", params.id)
    .maybeSingle();
  if (error) console.error("[talent/onboarding] plan load failed:", error.message);
  if (!data) notFound();

  const row = data as unknown as {
    plan_url: string | null;
    plan_path: string | null;
    team_members:
      | { people: NamedPerson | NamedPerson[] | null }
      | { people: NamedPerson | NamedPerson[] | null }[]
      | null;
  };

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

  const tm = one(row.team_members);
  const person = one(tm?.people);
  const name = personName(person, "team member");

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent/onboarding">← Onboarding</Link>}
        title={`${name}'s onboarding plan`}
        sub="The plan their manager laid out for the first 180 days"
      />
      <div className="admin-card admin-content u-p-5">
        <div className="admin-plan-doc" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </>
  );
}
