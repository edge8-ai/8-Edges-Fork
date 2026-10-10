// Server-only. The team assistant's tools over clients, deals and money
// (2026-10-02). The first four are open to every employee and never return a
// per-client figure or a contact person. client_financials and client_contacts
// check ChatAccess inside the body, so hiding them from the model is only an
// extra layer. A refusal is a plain sentence for the model to relay.

import { mustCount, mustRows } from "@/kernel/data/read";
import { personName } from "@/kernel/config/people-name";
import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectOrders } from "@/entities/billing";
import { selectPersonCompanies } from "@/entities/contacts";
import { selectDeals, selectLead, selectPipelineStages } from "@/entities/crm";
import { INVOICE_VOIDED, selectExpenses, selectInvoices, selectProducts } from "@/entities/finance";
import { canSeeClient, seesAnyClient, type ChatAccess } from "./access";
import {
  companyNamesFor,
  contains,
  findCompany,
  namesFor,
  ok,
  periodOf,
  refuse,
  sumByCurrency,
  text,
  type ToolInput,
  type ToolOutcome,
} from "./shared";

// Saigon-day bounds for timestamptz columns, so a period means the business calendar.
const startOf = (date: string) => `${date}T00:00:00+07:00`;
const endOf = (date: string) => `${date}T23:59:59.999+07:00`;

const FINANCIALS_REFUSAL = (name: string) =>
  `You can't see ${name}'s financials. Per-client figures are only for people assigned to that client or with revenue access. Company-wide totals are available to everyone.`;
const BREAKDOWN_REFUSAL =
  "Revenue by client is only for people with revenue access or a client assignment. Company-wide totals are available to everyone.";
const CONTACTS_REFUSAL = (name: string) =>
  `You can't see the contact people at ${name}. Contact details are only for people assigned to that client or with revenue access.`;

export async function companyTotals(input: ToolInput): Promise<ToolOutcome> {
  const { from, to } = periodOf(input);
  const [invoices, orders, expenses, pipeline] = await Promise.all([
    selectInvoices("amount_cents, balance_cents, currency")
      .gte("txn_date", from)
      .lte("txn_date", to)
      .neq("status", INVOICE_VOIDED),
    selectOrders("amount_usd_cents").eq("status", "paid").gte("created_at", startOf(from)).lte("created_at", endOf(to)),
    selectExpenses("amount_cents, currency").gte("incurred_on", from).lte("incurred_on", to),
    selectDeals("amount_usd_cents").eq("status", "open").is("archived_at", null),
  ]);
  const inv = mustRows(invoices, "[team/chat] invoices totals") as {
    amount_cents: number;
    balance_cents: number;
    currency: string;
  }[];
  const ord = mustRows(orders, "[team/chat] orders totals") as { amount_usd_cents: number | null }[];
  const exp = mustRows(expenses, "[team/chat] expenses totals") as { amount_cents: number; currency: string }[];
  const open = mustRows(pipeline, "[team/chat] pipeline totals") as { amount_usd_cents: number | null }[];
  return ok({
    period: { from, to },
    invoiced: sumByCurrency(inv.map((r) => ({ currency: r.currency, cents: r.amount_cents }))),
    outstandingOnThoseInvoices: sumByCurrency(inv.map((r) => ({ currency: r.currency, cents: r.balance_cents }))),
    invoiceCount: inv.length,
    paidOrdersUsd: sumByCurrency(ord.map((r) => ({ currency: "USD", cents: r.amount_usd_cents }))).USD ?? 0,
    paidOrderCount: ord.length,
    expenses: sumByCurrency(exp.map((r) => ({ currency: r.currency, cents: r.amount_cents }))),
    openPipeline: {
      deals: open.length,
      usd: sumByCurrency(open.map((r) => ({ currency: "USD", cents: r.amount_usd_cents }))).USD ?? 0,
    },
  });
}

export async function customersAndProspects(input: ToolInput): Promise<ToolOutcome> {
  const { from, to } = periodOf(input);
  const [customers, won, leads, prospects] = await Promise.all([
    selectCompanies("id", { count: "exact", head: true }).eq("lifecycle_stage", "customer").is("archived_at", null),
    selectDeals("company_id").eq("status", "won").gte("closed_at", startOf(from)).lte("closed_at", endOf(to)),
    selectLead("id", { count: "exact", head: true }).gte("created_at", startOf(from)).lte("created_at", endOf(to)),
    selectCompanies("name")
      .in("lifecycle_stage", ["lead", "sql", "opportunity"])
      .gte("created_at", startOf(from))
      .lte("created_at", endOf(to))
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const wonRows = mustRows(won, "[team/chat] won deals") as { company_id: string | null }[];
  const newCustomerNames = await companyNamesFor(wonRows.map((d) => d.company_id));
  return ok({
    period: { from, to },
    customers: mustCount(customers, "[team/chat] customer count"),
    newCustomers: [...newCustomerNames.values()].sort(),
    newLeads: mustCount(leads, "[team/chat] new leads"),
    newProspectBusinesses: (mustRows(prospects, "[team/chat] new prospects") as { name: string }[]).map((c) => c.name),
  });
}

export async function listBusinesses(input: ToolInput): Promise<ToolOutcome> {
  let q = selectCompanies("name, industry, country, lifecycle_stage, client_start_date, client_end_date").is(
    "archived_at",
    null,
  );
  if (text(input, "search")) q = q.ilike("name", contains(text(input, "search")));
  if (text(input, "stage")) q = q.eq("lifecycle_stage", text(input, "stage"));
  const rows = mustRows(await q.order("name").limit(100), "[team/chat] businesses");
  // Named field by field, so nothing beyond the business itself (notes, a
  // billing address) can reach the model even if the column list grows.
  const businesses = rows.map((c) => ({
    name: c.name,
    industry: c.industry,
    country: c.country,
    stage: c.lifecycle_stage,
    clientSince: c.client_start_date,
    clientUntil: c.client_end_date,
  }));
  return ok({ businesses, ...(rows.length === 100 ? { note: "first 100 shown" } : {}) });
}

type DealRow = {
  title: string;
  status: string;
  stage_id: string | null;
  owner_id: string | null;
  company_id: string | null;
  amount_cents: number;
  currency: string;
  amount_usd_cents: number | null;
  expected_close_date: string | null;
  closed_at: string | null;
};

export async function listDeals(input: ToolInput): Promise<ToolOutcome> {
  // person_id (the contact on the deal) is deliberately not selected.
  let q = selectDeals(
    "title, status, stage_id, owner_id, company_id, amount_cents, currency, amount_usd_cents, expected_close_date, closed_at",
  ).is("archived_at", null);
  if (text(input, "company")) {
    const found = await findCompany(text(input, "company"));
    if (!found.ok) return found.outcome;
    q = q.eq("company_id", found.id);
  }
  if (text(input, "search")) q = q.ilike("title", contains(text(input, "search")));
  if (["open", "won", "lost"].includes(text(input, "status"))) q = q.eq("status", text(input, "status"));
  const deals = mustRows(await q.order("created_at", { ascending: false }).limit(50), "[team/chat] deals") as DealRow[];

  const stageIds = [...new Set(deals.map((d) => d.stage_id).filter((id): id is string => Boolean(id)))];
  const [stages, owners, companies] = await Promise.all([
    stageIds.length
      ? selectPipelineStages("id, name").in("id", stageIds)
      : Promise.resolve({ data: [], error: null }),
    namesFor(deals.map((d) => d.owner_id)),
    companyNamesFor(deals.map((d) => d.company_id)),
  ]);
  const stageName = new Map(
    (mustRows(stages, "[team/chat] deal stages") as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );
  return ok({
    deals: deals.map((d) => ({
      title: d.title,
      business: d.company_id ? (companies.get(d.company_id) ?? null) : null,
      stage: d.stage_id ? (stageName.get(d.stage_id) ?? null) : null,
      status: d.status,
      owner: d.owner_id ? (owners.get(d.owner_id) ?? null) : null,
      amount: d.amount_cents / 100,
      currency: d.currency,
      amountUsd: d.amount_usd_cents == null ? null : d.amount_usd_cents / 100,
      expectedClose: d.expected_close_date,
      closedAt: d.closed_at,
    })),
  });
}

type InvoiceRow = {
  company_id: string | null;
  doc_number: string | null;
  txn_date: string;
  due_date: string | null;
  amount_cents: number;
  balance_cents: number;
  currency: string;
  status: string;
};

export async function clientFinancials(input: ToolInput, access: ChatAccess): Promise<ToolOutcome> {
  const company = text(input, "company");
  if (company) {
    const found = await findCompany(company);
    if (!found.ok) return found.outcome;
    if (!canSeeClient(access, found.id)) return refuse(FINANCIALS_REFUSAL(found.name));
    return ok(await oneClient(found.id, found.name));
  }

  if (!seesAnyClient(access)) return refuse(BREAKDOWN_REFUSAL);
  const { from, to } = periodOf(input);
  let q = selectInvoices("company_id, amount_cents, balance_cents, currency")
    .gte("txn_date", from)
    .lte("txn_date", to)
    .neq("status", INVOICE_VOIDED)
    .not("company_id", "is", null);
  if (!access.hasRevenueAccess) q = q.in("company_id", access.assignedClientIds);
  // The query is already narrowed; the filter re-applies the rule to what came
  // back, so a query change can never widen what reaches the model.
  const rows = (mustRows(await q, "[team/chat] invoices by client") as InvoiceRow[]).filter(
    (r) => r.company_id && canSeeClient(access, r.company_id),
  );
  const byClient = new Map<string, InvoiceRow[]>();
  for (const r of rows) byClient.set(r.company_id!, [...(byClient.get(r.company_id!) ?? []), r]);
  const names = await companyNamesFor([...byClient.keys()]);
  const clients = [...byClient.entries()].map(([id, list]) => ({
    client: names.get(id) ?? "Unknown business",
    invoiced: sumByCurrency(list.map((r) => ({ currency: r.currency, cents: r.amount_cents }))),
    outstanding: sumByCurrency(list.map((r) => ({ currency: r.currency, cents: r.balance_cents }))),
    invoiceCount: list.length,
  }));
  const largest = (c: (typeof clients)[number]) => Math.max(0, ...Object.values(c.invoiced));
  clients.sort((a, b) => largest(b) - largest(a));
  return ok({
    period: { from, to },
    scope: access.hasRevenueAccess ? "all clients" : "only the clients you are assigned to",
    clients,
  });
}

async function oneClient(companyId: string, name: string) {
  const [invoices, links] = await Promise.all([
    selectInvoices("company_id, doc_number, txn_date, due_date, amount_cents, balance_cents, currency, status")
      .eq("company_id", companyId)
      .order("txn_date", { ascending: false })
      .limit(100),
    selectPersonCompanies("person_id").eq("company_id", companyId),
  ]);
  const inv = (mustRows(invoices, "[team/chat] client invoices") as InvoiceRow[]).filter(
    (r) => r.company_id === companyId,
  );
  const personIds = (mustRows(links, "[team/chat] client people") as { person_id: string }[]).map((l) => l.person_id);
  const orders = personIds.length
    ? (mustRows(
        await selectOrders("created_at, status, amount_cents, currency, amount_usd_cents, refunded_cents, product_id")
          .in("person_id", personIds)
          .order("created_at", { ascending: false })
          .limit(100),
        "[team/chat] client orders",
      ) as {
        created_at: string;
        status: string;
        amount_cents: number;
        currency: string;
        amount_usd_cents: number | null;
        refunded_cents: number;
        product_id: string | null;
      }[])
    : [];
  const productIds = [...new Set(orders.map((o) => o.product_id).filter((id): id is string => Boolean(id)))];
  const products = productIds.length
    ? (mustRows(await selectProducts("id, name").in("id", productIds), "[team/chat] order products") as {
        id: string;
        name: string;
      }[])
    : [];
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const live = inv.filter((r) => r.status !== INVOICE_VOIDED);
  return {
    client: name,
    invoiced: sumByCurrency(live.map((r) => ({ currency: r.currency, cents: r.amount_cents }))),
    outstanding: sumByCurrency(live.map((r) => ({ currency: r.currency, cents: r.balance_cents }))),
    invoices: inv.map((r) => ({
      number: r.doc_number,
      date: r.txn_date,
      due: r.due_date,
      amount: r.amount_cents / 100,
      balance: r.balance_cents / 100,
      currency: r.currency,
      status: r.status,
    })),
    orders: orders.map((o) => ({
      date: o.created_at,
      product: o.product_id ? (productName.get(o.product_id) ?? null) : null,
      status: o.status,
      amount: o.amount_cents / 100,
      currency: o.currency,
      amountUsd: o.amount_usd_cents == null ? null : o.amount_usd_cents / 100,
      refunded: o.refunded_cents / 100,
    })),
  };
}

export async function clientContacts(input: ToolInput, access: ChatAccess): Promise<ToolOutcome> {
  const found = await findCompany(text(input, "company"));
  if (!found.ok) return found.outcome;
  if (!canSeeClient(access, found.id)) return refuse(CONTACTS_REFUSAL(found.name));

  const links = mustRows(
    await selectPersonCompanies("person_id, company_id, title, role, end_date").eq("company_id", found.id),
    "[team/chat] client contact links",
  ) as { person_id: string; company_id: string; title: string | null; role: string; end_date: string | null }[];
  const mine = links.filter((l) => l.company_id === found.id);
  if (!mine.length) return ok({ client: found.name, contacts: [] });
  const people = mustRows(
    await companyOs
      .from("people")
      .select("id, full_name, preferred_name, display_name, email, phone, city, country")
      .in(
        "id",
        mine.map((l) => l.person_id),
      )
      .is("archived_at", null),
    "[team/chat] client contacts",
  );
  const link = new Map(mine.map((l) => [l.person_id, l]));
  return ok({
    client: found.name,
    contacts: people.map((p) => ({
      name: personName(p),
      title: link.get(p.id)?.title ?? null,
      role: link.get(p.id)?.role ?? null,
      current: !link.get(p.id)?.end_date,
      email: p.email,
      phone: p.phone,
      city: p.city,
      country: p.country,
    })),
  });
}
