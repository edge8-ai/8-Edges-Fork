import { getAccess, requirePermission } from "@/kernel/identity/access-request";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { notFound } from "next/navigation";
import { getCompany360, getCompanyReferredBy } from "@/entities/crm/lib/companies";
import { getPortalAccessForCompany, getPortalMembershipsForCompany } from "@/entities/crm/lib/portal";
import { getAssignmentsForCompany, listActiveTeamMembers, listClientContacts } from "@/entities/contacts";
import { getInvoicesForCompany } from "@/entities/crm/lib/invoices";
import { getMeetingsForCompany } from "@/entities/crm/lib/meetings";
import { usdOf } from "@/entities/crm/lib/revenue-metrics/shared";
import { listDocumentsForCompanies } from "@/entities/portal";
import { getBoardBySlug, getLiveCardItemIds, listBoardManageOptions, moveCardColumn, selectBoards, Workboard } from "@/entities/boards";
import { selectClientRoadmapOverview, selectClientRoadmapGroups, selectClientBacklogItems, selectAiPrograms, BACKLOG_SELECT, ROADMAP_GROUPS_SELECT, type BacklogItem, type RoadmapGroup, ROADMAP_ACTIONS, SAVE_ROADMAP_OVERVIEW } from "@/entities/client-programs";
import { getCompanyHubTeam, listAssignableStaff } from "@/entities/crm/lib/company-hub";
import { fetchAll, hubProgramCard, listProgramSummaries, PROGRAM_SELECT, type ProgramSummary, type ProgramSummaryInputs } from "@/entities/team";
import {
  computeTokenUsage,
  fetchDeliveryRaw,
  getAllocatedTokensForCompanies,
  getTokenBalanceForCompanies,
  type TokenUsage,
} from "@/entities/portal";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { Tabs, type TabDef } from "@/kernel/ui/Tabs";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { PortalMemberControls } from "@/entities/crm/ui/PortalMemberControls";
import { CrmCommandBar } from "@/entities/crm/ui/CrmCommandBar";
import { CompanyDocuments, type ProgramOption } from "@/entities/crm/ui/CompanyDocuments";
import { HubTeamPanel } from "@/entities/contacts";
import { InvoicesPanel } from "@/entities/finance";
import { MeetingsPanel } from "@/entities/crm/ui/MeetingsPanel";
import { AdminHubTokensBand } from "./AdminHubTokensBand";
import { BacklogAdminEditor, OverviewEditor } from "@/entities/client-programs/client";
import { setMeetingPublished, setMeetingProgram } from "@/entities/crm/lib/meetings-actions";
import { companyOs } from "@/kernel/data/supabase";
import { proposalsTab } from "./HubProposalsPanel";
import { firstParam, mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";
import { CompanyDetailsCard } from "../CompanyDetailsCard";
import { AssignedStaffCard } from "@/entities/company-os";
import { getSurveyResponsesForCompany } from "@/entities/org";
import { CompanyDangerZone } from "../CompanyDangerZone";
import { ClientTermCard } from "../ClientTermCard";
import { RenewalCard } from "../RenewalCard";
import { getLiveRenewal } from "@/entities/crm/lib/renewals";
import { saigonToday } from "@/kernel/config/dates";
import { PortalAccessCard } from "../PortalAccessCard";
import { ClientSummaryStrip } from "../ClientSummaryStrip";
import { CompanyAffiliateCard } from "../CompanyAffiliateCard";
import { CompanySurveysTable } from "../CompanySurveysTable";
import { clientStatus, CLIENT_STATUS_LABEL } from "@/kernel/identity/client-status";
import { readAuditPage } from "@/kernel/audit/history-read";
import { RecordHistoryList } from "@/kernel/ui/RecordHistory";

function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}

export default async function CompanyDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<SearchParamsObj>;
  }
) {
  await requirePermission("crm.pipeline");
  const searchParams = await props.searchParams;
  const params = await props.params;
  const data = await getCompany360(params.id);
  if (!data) notFound();

  const { company, deals, people, affiliate: companyAffiliate } = data;
  const name = company.name || "(no name)";
  const clientState = clientStatus(company), isClient = clientState !== "none";

  const viewParam = firstParam(searchParams.view);
  const view = viewParam === "hub" ? "hub" : viewParam === "internal" ? "internal" : isClient ? "hub" : "internal";

  // Context-aware back-link: reflect where the user came from (Client Hubs,
  // Clients, or the Companies list) rather than always "Companies".
  const from = firstParam(searchParams.from);
  const back =
    from === "client-hubs"
      ? { href: "/admin/client-hubs", label: "← Client Hubs" }
      : from === "clients"
        ? { href: "/admin/revenue/clients", label: "← Clients" }
        : { href: "/admin/revenue/companies", label: "← Companies" };

  // A deal with no USD value counts as nothing rather than adding A$ as US$.
  const dealValueCents = deals.reduce((s, d) => s + usdOf(d), 0);
  const affiliateContacts = people.filter((p) => p.affiliateActive);
  const showAffiliateCard = !!companyAffiliate?.active || affiliateContacts.length > 0;
  const portalAccess = view === "internal" ? await getPortalAccessForCompany(company.id) : [];

  // ── Internal tabs ────────────────────────────────────────────────
  async function internalTabs(): Promise<TabDef[]> {
    const [portalMemberships, assignments, assignableTeamMembers, clientContacts, referredBy, surveys, recordHistory, renewal] =
      await Promise.all([
      getPortalMembershipsForCompany(company.id),
      getAssignmentsForCompany(company.id),
      listActiveTeamMembers(),
      listClientContacts(company.id),
      getCompanyReferredBy(company.id),
      getSurveyResponsesForCompany(company.id),
      // What has been done to this company record, and by whom (S.4).
      readAuditPage("companies", company.id, 0, 20),
      getLiveRenewal(company.id),
    ]);
    const activeMemberCount = [...portalMemberships.values()].filter((m) => m.status === "active").length;

    return [
      {
        key: "details",
        label: "Details",
        content: (
          <div className="u-grid-2-1 u-items-start"><div className="u-stack u-gap-4">
            <CompanyDetailsCard
              company={{
                id: company.id,
                name: company.name,
                website_url: company.website_url,
                industry_normalized: company.industry_normalized,
                size_band: company.size_band,
                country: company.country,
                priority: company.priority,
                notes: company.notes,
                created_at: company.created_at,
              }}
              referredBy={referredBy}
            />
            <ClientTermCard companyId={company.id} startDate={company.client_start_date} endDate={company.client_end_date} />
            <RenewalCard companyId={company.id} renewal={renewal} today={saigonToday()} />
            {showAffiliateCard && <CompanyAffiliateCard companyAffiliate={companyAffiliate} affiliateContacts={affiliateContacts} />}
            <div className="admin-card admin-section-card">
              <CompanyDangerZone companyId={company.id} companyName={name} />
            </div>
          </div><PortalAccessCard rows={portalAccess} /></div>
        ),
      },
      {
        key: "people",
        label: "People & access",
        count: activeMemberCount,
        content:
          people.length === 0 ? (
            <Empty text="No linked people yet. Link a contact from the CRM to invite them to the portal." />
          ) : (
            <div className="admin-list">
              {people.map((p) => {
                const membership = portalMemberships.get(p.id);
                const hasEmail = !p.email.startsWith("no-email+");
                return (
                  <div className="admin-list-row" key={p.id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">
                        <Link href={`/admin/contacts/${p.id}`}>{p.name}</Link>
                      </div>
                      <div className="admin-list-sub">{hasEmail ? p.email : "No email yet"}</div>
                    </div>
                    <div className="admin-list-aside">
                      <PortalMemberControls
                        personId={p.id}
                        companyId={company.id}
                        active={membership?.status === "active"}
                        role={membership?.role}
                        hasEmail={hasEmail}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ),
      },
      {
        key: "staffing",
        label: "Staffing",
        count: assignments.length,
        content: (
          <AssignedStaffCard
            companyId={company.id}
            assignments={assignments}
            teamMembers={assignableTeamMembers}
            clientContacts={clientContacts}
          />
        ),
      },
      {
        key: "surveys",
        label: "Surveys",
        count: surveys.length,
        content: <CompanySurveysTable surveys={surveys} />,
      },
      {
        key: "history",
        label: "History",
        content: (
          <div className="admin-card admin-section-card">
            {recordHistory.ok ? (
              <RecordHistoryList entries={recordHistory.page.entries} />
            ) : (
              <div className="admin-empty">History could not be read: {recordHistory.error}</div>
            )}
          </div>
        ),
      },
    ];
  }

  // ── Client Hub tabs + top band data ──────────────────────────────
  // The hub home is organized by AI Program: a company-grain Human Tokens
  // strip, the program card grid, then the company-wide tabs. When programs
  // exist, the Work Board / Roadmap / Documents tabs show ONLY untagged
  // (ai_program_id null) rows, so nothing is presented twice; tagged rows live
  // in their program view. Meetings are the exception: the tab lists every
  // meeting, tagged ones with their program, and a tagged meeting shows on its
  // program page as well. When no programs exist, the tabs behave as before.
  async function hubData(): Promise<{ tabs: TabDef[]; programs: ProgramSummary[]; usage: TokenUsage }> {
    // Wave 1: every query here depends only on the company id, and every
    // dataset is fetched exactly once. The program summaries and the token
    // usage are DERIVED from these rows below rather than re-fetching them.
    const [
      { data: programData },
      delivery,
      boardRowsRes,
      balance,
      allocatedTokens,
      boardOptions,
      admin,
      itemRows,
      groupRows,
      overviewRow,
      meetings,
      invoices,
      team,
      documents,
    ] = await Promise.all([
      selectAiPrograms(PROGRAM_SELECT).eq("company_id", company.id).neq("status", "archived").order("created_at", { ascending: false }),
      fetchDeliveryRaw([company.id]),
      selectBoards("id, slug, ai_program_id")
        .eq("client_company_id", company.id)
        .eq("status", "active")
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      getTokenBalanceForCompanies([company.id]),
      getAllocatedTokensForCompanies([company.id]),
      listBoardManageOptions(),
      getAccess().then((a) => a?.user ?? null),
      // Paginated: backlog items routinely outgrow PostgREST's 1000-row cap,
      // and a truncated read would undercount plannedTokens and could wrongly
      // drop the company-wide tabs. Trailing .order("id") keeps pages stable.
      fetchAll<BacklogItem>(() =>
        selectClientBacklogItems(BACKLOG_SELECT)
          .eq("company_id", company.id)
          .is("archived_at", null)
          .order("sort_order", { ascending: true })
          .order("id"),
      ),
      selectClientRoadmapGroups(ROADMAP_GROUPS_SELECT).eq("company_id", company.id).is("archived_at", null).order("sort_order", { ascending: true }),
      selectClientRoadmapOverview("body").eq("company_id", company.id).maybeSingle(),
      getMeetingsForCompany(company.id),
      getInvoicesForCompany(company.id),
      getCompanyHubTeam(company.id),
      listDocumentsForCompanies([company.id]),
    ]);

    const programRowsFull = (programData ?? []) as ProgramSummaryInputs["programs"];
    const hasPrograms = programRowsFull.length > 0;
    const hubBoards = (boardRowsRes.data ?? []) as Array<{ id: string; slug: string; ai_program_id: string | null }>;
    const untaggedBoards = hubBoards.filter((b) => !b.ai_program_id);
    // First active board (same "first active" convention as before); with
    // programs present, first active UNTAGGED board (program boards render in
    // their program view instead).
    const boardSlug = (hasPrograms ? untaggedBoards[0] : hubBoards[0])?.slug ?? null;

    const allItems = itemRows;
    const allGroups = (groupRows.data ?? []) as unknown as RoadmapGroup[];
    // Company-wide slices: untagged rows only once programs exist.
    const roadmapItems = hasPrograms ? allItems.filter((i) => !i.ai_program_id) : allItems;
    const usedKeys = new Set(roadmapItems.map((i) => i.group_key));
    const roadmapGroups = hasPrograms
      ? allGroups.filter((g) => g.ai_program_id === null || usedKeys.has(g.key))
      : allGroups;
    // Meetings are a company-level record: every meeting shows here with its
    // program tag, and a tagged one shows on its program page as well.
    const hubMeetings = meetings;
    // Both tabs drop together only when at least one row is program-tagged AND
    // nothing company-wide remains (zero data loss of access; each tagged row
    // is reachable in its program view). The tagged-row guard keeps a company
    // with programs but no boards/items from vacuously losing the tabs, which
    // hold the OverviewEditor and the place to start a company-wide roadmap.
    const taggedBoardCount = hubBoards.length - untaggedBoards.length;
    const taggedItemCount = allItems.length - roadmapItems.length;
    const dropCompanyWideTabs =
      hasPrograms &&
      taggedBoardCount + taggedItemCount > 0 &&
      untaggedBoards.length === 0 &&
      roadmapItems.length === 0;
    const overviewBody = (overviewRow.data as { body: string } | null)?.body ?? "";

    // Wave 2: the only fetches that depend on wave 1 (board slug, repo ids,
    // the admin's email, the filtered item ids).
    const [programSummaries, boardDetail, liveCardItemIds, viewerRow, assignees] = await Promise.all([
      listProgramSummaries(company.id, {
        programs: programRowsFull,
        delivery,
        backlogRows: allItems,
        boardRows: hubBoards,
      }),
      boardSlug ? getBoardBySlug(boardSlug) : Promise.resolve(null),
      getLiveCardItemIds(roadmapItems.map((i) => i.id)),
      // The admin's own person row, so cards freshly assigned to them wear "New".
      admin
        ? companyOs.from("people").select("id").eq("email", admin.email).is("archived_at", null).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      listAssignableStaff(company.id),
    ]);
    const viewerPersonId = (viewerRow.data as { id: string } | null)?.id ?? null;

    const plannedTokens = allItems.reduce((sum, i) => sum + Number(i.token_high ?? 0), 0);
    const usage = computeTokenUsage({ balance, allocatedTokens, plannedTokens, delivery });

    const programOptions: ProgramOption[] = programRowsFull.map((p) => ({ id: p.id, name: p.name }));
    const hubInvoices = invoices.map((r) => ({
      id: r.id,
      docNumber: r.doc_number,
      txnDate: r.txn_date,
      dueDate: r.due_date,
      currency: r.currency,
      amountCents: r.amount_cents,
      balanceCents: r.balance_cents,
      status: r.status,
    }));

    const companyWideTabs: TabDef[] = dropCompanyWideTabs
      ? []
      : [
          {
            key: "board",
            label: hasPrograms ? "Work Board (company-wide)" : "Work Board",
            content: boardDetail ? (
              <Workboard data={boardDetail} onMove={moveCardColumn} extras canManage teamOptions={boardOptions.team} clientOptions={boardOptions.clients} programOptions={boardOptions.programs} viewerPersonId={viewerPersonId} />
            ) : (
              <section className="admin-card admin-section-card">
                <Empty
                  text={
                    hasPrograms
                      ? "No company-wide work board. Program boards live in their AI Program view."
                      : "This client has no active work board yet. Create one from Work Boards."
                  }
                />
              </section>
            ),
          },
          {
            key: "roadmap",
            label: hasPrograms ? "Roadmap (company-wide)" : "Roadmap",
            count: roadmapItems.length,
            content: (
              <>
                <OverviewEditor save={SAVE_ROADMAP_OVERVIEW} companyId={company.id} initialBody={overviewBody} />
                <BacklogAdminEditor
                  actions={ROADMAP_ACTIONS}
                  companyId={company.id}
                  groups={roadmapGroups}
                  items={roadmapItems}
                  programs={hasPrograms ? programOptions : undefined}
                  showArchived={false}
                  liveCardItemIds={liveCardItemIds}
                  assignees={assignees}
                />
              </>
            ),
          },
        ];

    const tabs: TabDef[] = [
      ...companyWideTabs,
      {
        key: "documents",
        label: "Documents",
        count: documents.length,
        content: (
          <section className="admin-card admin-section-card">
            <CompanyDocuments companyId={company.id} documents={documents} programs={programOptions} />
          </section>
        ),
      },
      {
        key: "meetings",
        label: "Meetings",
        count: hubMeetings.length,
        content: (
          <section className="admin-card admin-section-card">
            <MeetingsPanel meetings={hubMeetings} publishAction={setMeetingPublished} programAction={setMeetingProgram} programOptions={programOptions} />
          </section>
        ),
      },
      {
        key: "invoices",
        label: "Invoices",
        count: hubInvoices.length,
        content: (
          <section className="admin-card admin-section-card">
            <InvoicesPanel invoices={hubInvoices} />
          </section>
        ),
      },
      proposalsTab(deals),
      { key: "team", label: "Team", content: <HubTeamPanel team={team} /> },
    ];

    return { tabs, programs: programSummaries, usage };
  }

  const hub = view === "hub" ? await hubData() : null;
  const tabs = hub ? hub.tabs : await internalTabs();

  return (
    <div>
      <PageHead
        eyebrow={<Link href={back.href}>{back.label}</Link>}
        title={name}
        sub={company.website_url || undefined}
        action={
          <div className="u-stack u-items-end">
            <span className="u-row u-wrap">
              {company.archived_at && <Badge tone="neutral">Archived</Badge>}
              {isClient ? <Badge tone={clientState === "current" ? "ok" : "neutral"}>{CLIENT_STATUS_LABEL[clientState]}</Badge> : company.lifecycle_stage && <Badge tone="neutral">{humanize(company.lifecycle_stage)}</Badge>}
              {company.priority && <Badge>{humanize(company.priority)}</Badge>}
            </span>
            <CrmCommandBar
              kind="company"
              id={company.id}
              name={name}
              archived={!!company.archived_at}
              assumeCompanyId={company.id}
              affiliate={{ active: !!companyAffiliate?.active, code: companyAffiliate?.code ?? null }}
            />
          </div>
        }
      />

      <div className="admin-card-head">
        {isClient ? (
          <div className="admin-viewtoggle">
            <Link href={`/admin/revenue/companies/${company.id}${mergeQuery(searchParams, { view: "internal" })}`} className={view === "internal" ? "is-active" : ""}>
              Internal
            </Link>
            <Link href={`/admin/revenue/companies/${company.id}${mergeQuery(searchParams, { view: "hub" })}`} className={view === "hub" ? "is-active" : ""}>
              Client Hub
            </Link>
          </div>
        ) : (
          <span className="admin-cell-muted u-sm">Internal record</span>
        )}
        <span className="admin-cell-muted u-sm">
          {deals.length} {deals.length === 1 ? "deal" : "deals"}
          {dealValueCents ? ` · ${formatCents(dealValueCents, "usd")} total` : ""} ·{" "}
          <Link href={`/admin/revenue/deals?company=${company.id}`}>Open in CRM →</Link>
        </span>
      </div>

      {!hub && isClient && <ClientSummaryStrip startDate={company.client_start_date} endDate={company.client_end_date} portalAccess={portalAccess} contactCount={people.length} peopleHref={`/admin/revenue/companies/${company.id}${mergeQuery(searchParams, { view: "internal", tab: "people" })}`} />}
      {hub && <AdminHubTokensBand companyId={company.id} usage={hub.usage} programs={hub.programs.map(hubProgramCard)} />}

      <div className="admin-card admin-section-card">
        <Tabs key={firstParam(searchParams.tab)} tabs={tabs} initialKey={firstParam(searchParams.tab)} syncParam="tab" />
      </div>
    </div>
  );
}
