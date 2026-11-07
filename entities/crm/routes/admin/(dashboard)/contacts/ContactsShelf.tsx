"use client";

import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { legalName } from "@/kernel/config/people-name";
import type { Person360 } from "@/entities/crm/lib/contacts";
import { PersonEditForm } from "./[id]/PersonEditForm";
import { RecordHistory } from "@/kernel/ui/RecordHistory";
import { getPersonHistory, getPersonShelf } from "@/entities/crm/lib/contacts-actions";
import { CrmCommandBar } from "@/entities/crm/ui/CrmCommandBar";

// Client-owned shelf for the contacts list. One drawer at the provider level;
// rows push the selected contact into context and related data (companies,
// deals) is fetched lazily on open via a server action. Mirrors CompaniesShelf
// — never routed through DataTable's server-rendered getRowPreview (interactive
// content there renders with dead clicks).

export type ContactRow = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  persona: string | null;
  country: string | null;
  source: string | null;
  do_not_contact: boolean | null;
  is_team_member: boolean | null;
  archived_at: string | null;
  created_at: string;
  deal_value_usd_cents: number | null;
  deal_count: number | null;
};

const ShelfContext = createContext<{ open: (row: ContactRow) => void } | null>(null);

export function ContactsShelfProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ContactRow | null>(null);
  const open = useCallback((row: ContactRow) => setSelected(row), []);

  return (
    <ShelfContext.Provider value={{ open }}>
      {children}
      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow="Contact"
        title={legalName(selected, "(no name)")}
        history={
          selected && (
            <RecordHistory
              key={selected.id}
              load={(offset, limit) => getPersonHistory(selected.id, offset, limit)}
            />
          )
        }
      >
        {selected && <ContactShelfBody key={selected.id} row={selected} />}
      </DetailDrawer>
    </ShelfContext.Provider>
  );
}

export function ContactShelfRow({ row, children }: { row: ContactRow; children: ReactNode }) {
  const ctx = useContext(ShelfContext);

  // The row itself carries role="button", so exclude it from the interactive-
  // element guard — closest() matches the element AND its ancestors, and a
  // guard that can match the row swallows every click (dead shelf).
  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    ctx?.open(row);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      if (hitsInnerInteractive(e)) return;
      e.preventDefault();
      ctx?.open(row);
    }
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}

function ContactShelfBody({ row }: { row: ContactRow }) {
  const router = useRouter();
  const [data, setData] = useState<Person360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getPersonShelf(row.id);
    setData(r);
    setLoading(false);
  }, [row.id]);

  // The shelf body is keyed on the row, so a different contact remounts it and
  // `editing` starts false again; this effect only has to fetch.
  useEffect(() => {
    void load();
  }, [load]);

  const person = data?.person;
  const primaryCompany = data?.companies.find((c) => c.is_primary) ?? data?.companies[0] ?? null;

  return (
    <div className="admin-shelf-sections">
      <CrmCommandBar
        kind="contact"
        id={row.id}
        name={data?.name ?? legalName(row)}
        archived={data ? !!data.person.archived_at : !!row.archived_at}
        assumeCompanyId={primaryCompany?.company_id ?? null}
        onChanged={() => void load()}
      />

      <section>
        <div className="admin-shelf-heading">
          Details
          {person && !editing && (
            <button type="button" className="admin-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        {editing && person ? (
          <PersonEditForm
            person={person}
            onDone={() => {
              setEditing(false);
              void load();
              router.refresh();
            }}
          />
        ) : (
          <dl className="admin-kv">
            <dt>Email</dt>
            <dd>{row.email}</dd>
            <dt>Phone</dt>
            <dd>{(person?.phone ?? row.phone) || "—"}</dd>
            <dt>Persona</dt>
            <dd>{(person?.persona ?? row.persona) ? <Badge>{humanize(person?.persona ?? row.persona!)}</Badge> : "—"}</dd>
            <dt>Country</dt>
            <dd>{(person?.country ?? row.country) || "—"}</dd>
            <dt>Source</dt>
            <dd>{(person?.source ?? row.source) || "—"}</dd>
            <dt>LinkedIn</dt>
            <dd>
              <ExternalLink href={person?.linkedin_url} fallback="—">
                Profile
              </ExternalLink>
            </dd>
          </dl>
        )}
        {(row.archived_at || row.do_not_contact || row.is_team_member) && (
          <div className="u-row u-wrap u-gap-1 u-mt-3">
            {row.archived_at && <Badge tone="neutral">Archived</Badge>}
            {row.do_not_contact && <Badge tone="err">Do not contact</Badge>}
            {row.is_team_member && <Badge tone="info">Team</Badge>}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">Companies</div>
        {loading ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : !data || data.companies.length === 0 ? (
          <div className="admin-cell-muted">No linked companies.</div>
        ) : (
          <div className="admin-list">
            {data.companies.map((c) => (
              <div className="admin-list-row" key={c.company_id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">
                    <Link href={`/admin/revenue/companies/${c.company_id}`}>{c.name || "(no name)"}</Link>
                  </div>
                  {(c.title || c.role) && <div className="admin-list-sub">{c.title || humanize(c.role || "")}</div>}
                </div>
                {c.is_primary && <div className="admin-list-aside"><Badge tone="info">Primary</Badge></div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="admin-shelf-heading">Deals</div>
        {loading ? (
          <div className="admin-cell-muted">Loading…</div>
        ) : !data || data.deals.length === 0 ? (
          <div className="admin-cell-muted">No deals.</div>
        ) : (
          <div className="admin-list">
            {data.deals.map((d) => (
              <div className="admin-list-row" key={d.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{d.title || "Untitled deal"}</div>
                  <div className="admin-list-sub">{formatDate(d.created_at)}</div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={statusTone(d.status ?? "")}>{humanize(d.status ?? "") || "Open"}</Badge>
                  {(d.amount_usd_cents ?? d.amount_cents) != null && (
                    <span className="admin-cell-mono">
                      {formatCents(d.amount_usd_cents ?? d.amount_cents, d.amount_usd_cents != null ? "usd" : d.currency ?? "usd")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div>
        <Link href={`/admin/contacts/${row.id}`} className="admin-btn admin-btn--primary">
          Open full profile
        </Link>
      </div>
    </div>
  );
}
