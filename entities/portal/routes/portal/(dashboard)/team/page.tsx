import type { ReactNode } from "react";
import Image from "next/image";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getAssignedTeam, type PortalTeamMember } from "@/entities/portal/lib/team";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate, initials } from "@/kernel/ui/format";

// Stacked label-over-value, not the shared .admin-kv's side-by-side
// label|value grid. admin-kv's fixed 120px label column leaves too little
// room for a value like an email address at this card's width — no ratio
// tweak fixes that in general, since it's squeezing a ~20-character
// unbreakable string into whatever's left after the label column. Stacking
// gives the value the full card width, so it only wraps when it's actually
// too long for that, not because a sibling column ate half the space.
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="u-mb-3">
      <div className="u-sm u-muted">{label}</div>
      <div className="u-ink u-break-all">
        {value}
      </div>
    </div>
  );
}

function address(m: PortalTeamMember): string | null {
  return [m.city, m.stateProvince, m.country].filter(Boolean).join(", ") || null;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const size = 48;
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className="admin-avatar" style={{ width: size, height: size }} /* layout-ok: size from props */
      />
    );
  }
  return (
    <div
      className="admin-avatar admin-avatar--soft admin-avatar--text-md" style={{ width: size, height: size }} /* layout-ok: size from props */
    >
      {initials(name)}
    </div>
  );
}

// Client-facing team roster: the Edge8 staff dedicated to this client, scoped
// through company_os.staff_assignments. Directory-safe fields only — see
// entities/portal/lib/team.ts for the column contract (no balances, no employee_number,
// no manager chain).
export default async function PortalTeamPage() {
  const actor = await requirePortalPermission("surface.portal");
  const team = await getAssignedTeam(actor);

  return (
    <>
      <PageHead eyebrow="Client Portal" title="Edge8 Team" sub="The Edge8 people assigned to your account." />

      {team.length === 0 ? (
        <div className="admin-card admin-section-card">
          <div className="admin-empty">No dedicated staff assigned yet.</div>
        </div>
      ) : (
        <div
          className="admin-profile-card-grid"
        >
          {team.map((m) => {
            const name = m.name;
            const addr = address(m);
            return (
              <div className="admin-card admin-section-card" key={m.teamMemberId}>
                <div className="u-row u-gap-3 u-mb-4">
                  <Avatar name={name} avatarUrl={m.avatarUrl} />
                  <div>
                    <h2 className="admin-card-title u-mb-0">{name}</h2>
                    {(m.roleTitle || m.positionTitle) && (
                      <div className="admin-cell-muted u-sm">{m.roleTitle || m.positionTitle}</div>
                    )}
                  </div>
                </div>
                {m.email && <Field label="Email" value={<a href={`mailto:${m.email}`}>{m.email}</a>} />}
                {m.phone && <Field label="Phone" value={<a href={`tel:${m.phone}`}>{m.phone}</a>} />}
                {(addr || m.location) && <Field label="Based in" value={addr || m.location} />}
                {m.workSchedule && <Field label="Schedule" value={m.workSchedule} />}
                {m.startDate && <Field label="With you since" value={formatDate(m.startDate)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
