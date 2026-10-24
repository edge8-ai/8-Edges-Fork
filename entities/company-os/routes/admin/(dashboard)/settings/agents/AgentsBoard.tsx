"use client";

import type { MayProp } from "@/kernel/identity/may-prop";
import { Tabs } from "@/kernel/ui/Tabs";
import type { AgentRow } from "@/entities/company-os/lib/agent-rows";
import { RoutineCard } from "./RoutineCard";

// Settings -> Agents v2 (Y.25): every routine as a row that says what it is
// doing now, with its switch, Run now and its details, under four tabs. The
// rows arrive built and sorted from the server (lib/agent-rows.ts), needing
// attention first; this only filters them.

const TABS: { key: string; label: string; keep: (r: AgentRow) => boolean; empty: string }[] = [
  { key: "all", label: "All", keep: () => true, empty: "No routine is installed." },
  { key: "look", label: "Needs a look", keep: (r) => r.needsLook, empty: "Nothing needs a look: no error, no died run, no send nobody can vouch for." },
  { key: "busy", label: "Running or waiting", keep: (r) => r.busy, empty: "Nothing is running or waiting right now." },
  { key: "off", label: "Off", keep: (r) => r.off, empty: "Every routine is on." },
];

export function AgentsBoard({ rows, may }: { rows: AgentRow[]; may: MayProp }) {
  return (
    <div className="admin-agents">
      <Tabs
        tabs={TABS.map((t) => {
          const shown = rows.filter(t.keep);
          return {
            key: t.key,
            label: t.label,
            count: shown.length,
            // Keyed per tab: kernel/ui/Tabs reuses one panel, and a row's open
            // form or details must not carry over to the same row on another tab.
            content: (
              <section key={t.key} aria-label="Routines" className="admin-agents-list">
                {shown.length === 0 ? (
                  <p className="admin-agents-empty">{t.empty}</p>
                ) : (
                  shown.map((r) => <RoutineCard key={r.id} row={r} may={may} />)
                )}
              </section>
            ),
          };
        })}
      />
    </div>
  );
}
