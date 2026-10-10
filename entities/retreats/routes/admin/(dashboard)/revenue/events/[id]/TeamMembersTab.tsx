import { RetreatAgenda } from "@/entities/retreats";
import { STAFF_ROLE_LABELS, type AgendaBlock } from "@/entities/retreats/lib/event-agenda-shared";

// Who is working the event and when: the ops view of the agenda (every block,
// staff shown). Assignments are edited on the Agenda tab; this is the read view.
export function TeamMembersTab({ blocks }: { blocks: AgendaBlock[] }) {
  // Distinct team members across the event, with their roles and block count.
  const byPerson = new Map<string, { name: string; roles: Set<string>; blocks: number }>();
  for (const b of blocks) {
    for (const s of b.staff) {
      const cur = byPerson.get(s.personId) ?? { name: s.personName ?? "Unknown", roles: new Set<string>(), blocks: 0 };
      cur.roles.add(STAFF_ROLE_LABELS[s.role]);
      cur.blocks += 1;
      byPerson.set(s.personId, cur);
    }
  }
  const people = Array.from(byPerson.values()).sort((a, b) => b.blocks - a.blocks);

  return (
    <div className="u-stack u-gap-5">
      <div className="admin-hint">
        Who is working this event and their schedule. Assign team members to agenda blocks on the Agenda tab.
      </div>

      {people.length > 0 && (
        <div className="u-row u-wrap">
          {people.map((p) => (
            <span
              key={p.name}
              className="admin-chip-outline"
            >
              <strong>{p.name}</strong>
              <span className="admin-cell-muted u-sm">
                {Array.from(p.roles).join(", ")} · {p.blocks} block{p.blocks === 1 ? "" : "s"}
              </span>
            </span>
          ))}
        </div>
      )}

      <RetreatAgenda blocks={blocks} view="ops" />
    </div>
  );
}
