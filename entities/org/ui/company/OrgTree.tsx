import { initials } from "@/kernel/ui/format";
import type { OpenRole, OrgEntry } from "@/entities/org/lib/directory-shapes";
import { isLeaf, type OrgModel } from "@/entities/org/lib/org-tree";

// The top-down reporting tree, drawn from an OrgModel. The rails and drop lines
// are `.admin-org-tree li` descendant rules, so a seat is styled by its place
// in the tree rather than by a name. A manager's reports who lead nobody share
// one stacked column after the managers, which is what keeps the tree narrow.

export type Selection = { kind: "person" | "role"; id: string };

export const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Internship",
  temp: "Temporary",
  advisor: "Advisor",
};

export function OrgAvatar({ entry, large, you }: { entry: OrgEntry; large?: boolean; you?: boolean }) {
  const cls = ["admin-org-av", large ? "is-large" : "", you && !entry.avatarUrl ? "is-you" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- avatars are remote storage URLs, as on the directory. */}
      {entry.avatarUrl ? <img src={entry.avatarUrl} alt="" loading="lazy" /> : initials(entry.name)}
    </span>
  );
}

export function roleMeta(role: OpenRole): string {
  return [role.location, role.employmentType ? EMPLOYMENT_LABEL[role.employmentType] : null].filter(Boolean).join(" · ");
}

export type TreeProps = {
  model: OrgModel;
  collapsed: ReadonlySet<string>;
  filtering: boolean;
  matches: (entry: OrgEntry) => boolean;
  selected: Selection | null;
  viewerId: string | null;
  onSelect: (sel: Selection) => void;
  onToggle: (id: string) => void;
};

export function PersonCard({ entry, isRoot, p }: { entry: OrgEntry; isRoot?: boolean; p: TreeProps }) {
  const direct = p.model.kids.get(entry.id)?.length ?? 0;
  const you = entry.id === p.viewerId;
  const selected = p.selected?.kind === "person" && p.selected.id === entry.id;
  const cls = ["admin-org-card"];
  if (isRoot) cls.push("is-root");
  if (p.filtering) cls.push(p.matches(entry) ? "is-match" : "is-dim");
  if (selected) cls.push("is-selected");
  const title = [entry.positionTitle ?? "No title yet", entry.employmentType === "contract" ? "Contractor" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      className={cls.join(" ")}
      data-person={entry.id}
      aria-current={selected ? "true" : undefined}
      onClick={() => p.onSelect({ kind: "person", id: entry.id })}
    >
      <OrgAvatar entry={entry} you={you} />
      <span className="admin-org-tx">
        <span className="admin-org-nm">
          {entry.name}
          {you && <span className="admin-org-you">You</span>}
        </span>
        <span className="admin-org-ti">{title}</span>
        {direct > 0 && (
          <span className="admin-org-dr">
            {direct} direct {direct === 1 ? "report" : "reports"}
          </span>
        )}
      </span>
    </button>
  );
}

export function RoleCard({ role, p }: { role: OpenRole; p: TreeProps }) {
  const selected = p.selected?.kind === "role" && p.selected.id === role.id;
  const meta = roleMeta(role);
  return (
    <button
      type="button"
      className={`admin-org-card is-role${selected ? " is-selected" : ""}`}
      data-role={role.id}
      onClick={() => p.onSelect({ kind: "role", id: role.id })}
    >
      <span className="admin-org-av" aria-hidden="true">+</span>
      <span className="admin-org-tx">
        <span className="admin-org-nm">{role.title}</span>
        <span className="admin-org-ti">{meta ? `Hiring · ${meta}` : "Hiring"}</span>
      </span>
    </button>
  );
}

type Item = { entry: OrgEntry } | { role: OpenRole };
const itemKey = (it: Item) => ("entry" in it ? it.entry.id : `role-${it.role.id}`);

function LeafItem({ item, p }: { item: Item; p: TreeProps }) {
  return (
    <li>
      {"entry" in item ? (
        <div className="admin-org-node">
          <PersonCard entry={item.entry} p={p} />
        </div>
      ) : (
        <RoleCard role={item.role} p={p} />
      )}
    </li>
  );
}

function Branch({ items, p }: { items: Item[]; p: TreeProps }) {
  const leaf = (it: Item) => "role" in it || isLeaf(p.model, it.entry);
  if (items.every(leaf)) {
    return (
      <ul className="is-stack">
        {items.map((it) => (
          <LeafItem key={itemKey(it)} item={it} p={p} />
        ))}
      </ul>
    );
  }
  const managers = items.filter((it): it is { entry: OrgEntry } => !leaf(it));
  const leaves = items.filter(leaf);
  return (
    <ul>
      {managers.map((it) => (
        <Node key={it.entry.id} entry={it.entry} p={p} />
      ))}
      {leaves.length > 0 && (
        <li className="is-leafcol">
          <ul className="is-stack">
            {leaves.map((it) => (
              <LeafItem key={itemKey(it)} item={it} p={p} />
            ))}
          </ul>
        </li>
      )}
    </ul>
  );
}

// Every person has one manager, so each appears in exactly one list of reports,
// and buildOrgModel has already moved anyone in a loop out of the roots' reach:
// the recursion needs no visited set.
function Node({ entry, isRoot, p }: { entry: OrgEntry; isRoot?: boolean; p: TreeProps }) {
  const kids = p.model.kids.get(entry.id) ?? [];
  const items: Item[] = [...kids.map((k) => ({ entry: k })), ...p.model.rolesFor(entry.personId).map((r) => ({ role: r }))];
  const open = !p.collapsed.has(entry.id);
  return (
    <li>
      <div className="admin-org-node">
        <PersonCard entry={entry} isRoot={isRoot} p={p} />
        {items.length > 0 && (
          <button
            type="button"
            className="admin-org-nub"
            data-toggle={entry.id}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} ${entry.name}'s branch`}
            onClick={() => p.onToggle(entry.id)}
          >
            {open ? "−" : `+${items.length}`}
          </button>
        )}
      </div>
      {items.length > 0 && open && <Branch items={items} p={p} />}
    </li>
  );
}

export function OrgTree(p: TreeProps) {
  const { model } = p;
  return (
    <>
      <ul className="admin-org-tree">
        {model.roots.map((r) => (
          <Node key={r.id} entry={r} isRoot p={p} />
        ))}
      </ul>
      {(model.unplacedRoles.length > 0 || model.loose.length > 0) && (
        <div className="admin-org-extra">
          {model.unplacedRoles.length > 0 && (
            <div>
              <h3>Open roles without a hiring manager</h3>
              <div className="admin-org-row">
                {model.unplacedRoles.map((r) => (
                  <RoleCard key={r.id} role={r} p={p} />
                ))}
              </div>
            </div>
          )}
          {model.loose.length > 0 && (
            <div className="is-loose">
              <h3>Not connected to the top</h3>
              <div className="admin-org-row">
                {model.loose.map((e) => (
                  <PersonCard key={e.id} entry={e} p={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
