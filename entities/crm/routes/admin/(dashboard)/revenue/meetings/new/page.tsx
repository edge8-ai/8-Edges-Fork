import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { requirePermission } from "@/kernel/identity/access-request";
import { listCompanyOptions } from "@/entities/crm/lib/meetings";
import { PageHead } from "@/kernel/ui/PageHead";
import { MeetingUploadForm } from "@/entities/crm/ui/MeetingUploadForm";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";

export const metadata = {
  title: "Add Client Meeting",
  description: "Upload a meeting transcript and let AI summarize it.",
};

// Add New page. Reached from the List page and from the company 360 tab, which
// passes ?company=<id> to preselect the client.
export default async function NewMeetingPage(props: { searchParams: Promise<SearchParamsObj> }) {
  const searchParams = await props.searchParams;
  await requirePermission("crm.calls");
  const companies = await listCompanyOptions();
  const preselect = firstParam(searchParams.company);
  const defaultCompanyId = companies.some((c) => c.id === preselect) ? preselect : undefined;

  return (
    <div className="admin-content--form">
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/admin/revenue/meetings">
          ← All meeting notes
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Client Meetings"
        title="Add client meeting"
        sub="Paste a transcript or upload a file. AI writes the summary, then you publish it to the client."
      />

      <div className="admin-card admin-section-card">
        <MeetingUploadForm companies={companies} defaultCompanyId={defaultCompanyId} />
      </div>
    </div>
  );
}
