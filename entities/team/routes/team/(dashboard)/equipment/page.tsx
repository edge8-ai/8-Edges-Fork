import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getMyEquipment, getMyEquipmentRequests } from "@/entities/team/lib/equipment";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { DeviceArt } from "@/entities/team/ui/DeviceArt";
import { formatDate, humanize } from "@/kernel/ui/format";
import { RequestEquipmentForm } from "./RequestEquipmentForm";
import { EQUIPMENT_TYPES, specSummary, statusLabel } from "@/entities/org";

export const metadata = {
  title: "My Equipment",
  description: "The company equipment you are holding, and how to ask for more.",
};

function requestTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "fulfilled":
      return "ok";
    case "declined":
      return "err";
    default:
      return "warn";
  }
}

export default async function MyEquipmentPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const [items, requests] = await Promise.all([getMyEquipment(actor), getMyEquipmentRequests(actor)]);

  const open = requests.filter((r) => r.status === "pending");

  return (
    <>
      <PageHead
        eyebrow="My Equipment"
        title="What you're holding"
        sub={
          items.length === 0
            ? "Nothing is assigned to you right now."
            : `${items.length} ${items.length === 1 ? "item" : "items"} assigned to you` +
              (open.length ? ` · ${open.length} request${open.length === 1 ? "" : "s"} open` : "")
        }
      />

      {items.length > 0 && (
        <div className="admin-team-eq-grid">
          {items.map((it) => {
            const specs = specSummary(it);
            return (
              <article key={it.id} className="admin-team-eq-card">
                <div className="admin-team-eq-media">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                    <img src={it.image_url} alt="" className="admin-team-eq-photo" />
                  ) : (
                    <DeviceArt type={it.type} />
                  )}
                  <span className="admin-team-eq-tag">{it.asset_tag}</span>
                </div>
                <div className="admin-team-eq-body">
                  <h3 className="admin-team-eq-name">{it.name}</h3>
                  {specs && <p className="admin-team-eq-specs">{specs}</p>}
                  <dl className="admin-team-eq-meta">
                    {it.brand && (
                      <>
                        <dt>Brand</dt>
                        <dd>{[it.brand, it.model].filter(Boolean).join(" ")}</dd>
                      </>
                    )}
                    <dt>Serial</dt>
                    <dd>{it.serial_number ?? "Not recorded"}</dd>
                    {it.condition && (
                      <>
                        <dt>Condition</dt>
                        <dd>{humanize(it.condition)}</dd>
                      </>
                    )}
                  </dl>
                  <div className="admin-team-eq-foot">
                    <Badge tone={it.status === "in_repair" ? "warn" : "ok"}>{statusLabel(it.status)}</Badge>
                    <span className="admin-team-eq-type">{humanize(it.type)}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {items.length === 0 && (
        <div className="admin-card admin-section-card admin-team-eq-empty">
          <DeviceArt type="other" />
          <p>
            Nothing is assigned to you yet. If you are holding something that isn&apos;t listed here,
            tell Operations so the register matches reality.
          </p>
        </div>
      )}

      <div className="admin-team-eq-columns">
        <section className="admin-card admin-section-card">
          <h2 className="admin-team-eq-heading">Need something?</h2>
          <p className="admin-team-eq-lede">
            Ask here rather than in a chat thread, so the request doesn&apos;t get lost and whoever
            orders it can see what is already on the shelf.
          </p>
          <RequestEquipmentForm types={EQUIPMENT_TYPES} />
        </section>

        <section className="admin-card admin-section-card">
          <h2 className="admin-team-eq-heading">Your requests</h2>
          {requests.length === 0 ? (
            <p className="admin-team-eq-lede">You haven&apos;t asked for anything yet.</p>
          ) : (
            <ul className="admin-team-eq-requests">
              {requests.map((r) => (
                <li key={r.id}>
                  <div className="admin-team-eq-req-top">
                    <span className="admin-team-eq-req-type">{humanize(r.type)}</span>
                    <Badge tone={requestTone(r.status)}>{humanize(r.status)}</Badge>
                  </div>
                  {r.reason && <p className="admin-team-eq-req-reason">{r.reason}</p>}
                  <p className="admin-team-eq-req-date">
                    Asked {formatDate(r.created_at)}
                    {r.needed_by && ` · needed by ${formatDate(r.needed_by)}`}
                  </p>
                  {r.decision_note && <p className="admin-team-eq-req-note">{r.decision_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
