import type { Person360 } from "@/entities/crm/lib/contacts";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import type { TabDef } from "@/kernel/ui/Tabs";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";

// The contact page's tabs whose lists come from slots (ADR 0032): billing's
// orders and bookings, org's survey answers. A null list means the provider is
// not installed, and the tab is left out rather than shown empty.

const Empty = ({ text }: { text: string }) => <div className="admin-empty">{text}</div>;

/** The Orders and AIO Pad tabs, or none without billing. */
export function purchaseTabs(orders: Person360["orders"], bookings: Person360["bookings"]): TabDef[] {
  const tabs: TabDef[] = [];
  if (orders) {
    tabs.push({
      key: "orders",
      label: "Orders",
      count: orders.length,
      content: orders.length === 0 ? (
        <Empty text="No orders." />
      ) : (
        <div className="admin-list">
          {orders.map((o) => (
            <div className="admin-list-row" key={o.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{formatCents(o.amount_usd_cents, "usd")}</div>
                <div className="admin-list-sub">
                  {humanize(o.payment_method)} · {formatDate(o.created_at)}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }
  if (bookings) {
    tabs.push({
      key: "bookings",
      label: "AIO Pad",
      count: bookings.length,
      content: bookings.length === 0 ? (
        <Empty text="No bookings." />
      ) : (
        <div className="admin-list">
          {bookings.map((b) => (
            <div className="admin-list-row" key={b.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{humanize(b.kind)}</div>
                <div className="admin-list-sub">
                  {formatDate(b.start_date)} → {formatDate(b.end_date)}
                  {b.party_size ? ` · party of ${b.party_size}` : ""}
                </div>
              </div>
              <div className="admin-list-aside">
                <strong className="admin-cell-mono">{formatCents(b.amount_usd_cents, "usd")}</strong>
                <Badge tone={statusTone(b.status)}>{humanize(b.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    });
  }
  return tabs;
}

/** The Surveys tab, or none without org. */
export function surveyTabs(surveyResponses: Person360["surveyResponses"]): TabDef[] {
  if (!surveyResponses) return [];
  return [
    {
      key: "surveys",
      label: "Surveys",
      count: surveyResponses.length,
      content: surveyResponses.length === 0 ? (
        <Empty text="No survey responses." />
      ) : (
        <div className="admin-list">
          {surveyResponses.map((s) => (
            <div className="admin-list-row" key={s.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">Survey response</div>
                <div className="admin-list-sub">{formatDate(s.submitted_at ?? s.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];
}
