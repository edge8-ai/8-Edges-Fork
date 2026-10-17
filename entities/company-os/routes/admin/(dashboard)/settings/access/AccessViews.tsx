import { PersonPicker } from "./PersonPicker";
import { Badge } from "@/kernel/ui/Badge";
import type { Access } from "@/kernel/identity/access-model";
import type { AccessPersonOption, AccessRole } from "@/entities/company-os/lib/access-screen";

// The two questions Settings → Access answers in one place (ADR 0013): what can
// this person see, and why; and who can see this. Both are plain GET forms, so
// the answer is a URL that can be pasted into a conversation about it.

type Declared = { key: string; sentence: string; owner: string };

export function PersonView({
  people,
  person,
  access,
  roles,
}: {
  people: AccessPersonOption[];
  person: AccessPersonOption | null;
  access: Access | null;
  roles: AccessRole[];
  grantable: AccessRole[];
}) {
  const nameOf = new Map(roles.map((r) => [r.key, r]));
  return (
    <div className="admin-card admin-section-card">
      <form method="get" className="u-row u-wrap u-items-end u-gap-2 u-mb-4">
        <input type="hidden" name="tab" value="people" />
        <div className="admin-field u-flex-2 u-mb-0">
          <span className="admin-label">Person</span>
          <PersonPicker people={people} name="person" label="Person" defaultValue={person?.personId ?? ""} />
        </div>
        <button type="submit" className="admin-btn">
          Show
        </button>
      </form>

      {person && access && (
        <>
          <h2 className="admin-card-title">What {person.name} can see, and why</h2>
          <ul className="admin-list">
            {access.roles.map((r) => {
              const granted = r.because.startsWith("was granted it");
              return (
                <li key={`${r.role} ${r.because}`} className={granted ? undefined : "u-muted"}>
                  <strong>{nameOf.get(r.role)?.name ?? r.role}</strong> {granted ? <Badge tone="info">Granted</Badge> : <Badge>Implied</Badge>}{" "}
                  — {r.because}
                </li>
              );
            })}
          </ul>
          <h3 className="admin-label u-mt-3">Permissions ({access.permissions().length})</h3>
          <ul className="admin-list">
            {access.permissions().map((key) => (
              <li key={key}>
                <code>{key}</code>
              </li>
            ))}
          </ul>
          <p className="u-muted u-mt-2">Implied roles follow a fact about the person and change only when the fact does. Grant or revoke the others on the Roles tab.</p>
        </>
      )}
      {person && !access && <p className="u-muted">No record for this person.</p>}
    </div>
  );
}

export function PermissionView({ permissions, roles, selected }: { permissions: Declared[]; roles: AccessRole[]; selected: string | null }) {
  const atom = selected ? permissions.find((p) => p.key === selected) ?? null : null;
  const holding = atom ? roles.filter((r) => !r.archived && r.permissions.some((p) => p.permission === atom.key)) : [];
  return (
    <div className="admin-card admin-section-card">
      <form method="get" className="u-row u-wrap u-items-end u-gap-2 u-mb-4">
        <input type="hidden" name="tab" value="permissions" />
        <label className="admin-field u-flex-2 u-mb-0">
          <span className="admin-label">Permission</span>
          <select className="admin-select" name="permission" defaultValue={atom?.key ?? ""}>
            <option value="">Pick a permission…</option>
            {permissions.map((p) => (
              <option key={p.key} value={p.key}>
                {p.sentence} ({p.key})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-btn">
          Show
        </button>
      </form>

      {atom && (
        <>
          <h2 className="admin-card-title">Who can {atom.sentence.charAt(0).toLowerCase() + atom.sentence.slice(1)}</h2>
          <p className="u-muted">
            Declared by <code>{atom.owner}</code> as <code>{atom.key}</code>.
          </p>
          {holding.length === 0 ? (
            <p>No role holds it: nobody can.</p>
          ) : (
            <ul className="admin-list">
              {holding.map((r) => {
                const scope = r.permissions.find((p) => p.permission === atom.key)?.scope;
                return (
                  <li key={r.id}>
                    <strong>{r.name}</strong> <span className="u-muted">(reaching {scope})</span> —{" "}
                    {r.kind === "implied"
                      ? `anyone who ${r.impliedBy.join(", or who ") || "holds it"}`
                      : r.grants.length === 0
                        ? "granted to nobody yet"
                        : r.grants.map((g) => g.personName).join(", ")}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
