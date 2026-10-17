// The Client Programs entity's server door (RS-02, spec
// docs/engineering/2026-09-08-pluggable-entities-spec.md): the programme a
// client buys and the roadmap and backlog that track it.
//
// It sits at the bottom of the graph with Contacts because a programme is what
// boards, the admin roadmap screens and the client portal all hang work off:
// three entities read it and none of them may import each other. Its screens
// still live in company-os and portal and move here in a later slice; what
// moved first is ownership of the tables, because Boards could not become an
// entity while they belonged to Portal, which renders boards.
export * from "./lib/reads";
export * from "./lib/writes";
// The questions other entities ask of ai_programs, rather than the table name
// (A.14). `selectAiPrograms` only names the table, so five call sites in four
// entities each carried their own copy of the scope filter and the row cast;
// two of those copies had already drifted. A named question keeps the columns,
// the filter and the row shape inside the entity that owns the table.
export * from "./lib/program-scope";
// The client roadmap vocabulary: backlog priorities and statuses, the roadmap
// group and item shapes, the starter template and the pure helpers over them.
// It describes this entity's own tables (client_backlog_items,
// client_roadmap_groups), which is why it moved here from portal with RS-04 —
// portal, the admin roadmap screen and the team client hub all render it, and
// an entity cannot sit below the vocabulary of its own rows.
export * from "./lib/client-backlog";
// The program document store: the shared upload/link/delete primitives and the
// row shape behind the portal's Programs tab, the admin company page and the
// team client hub. program_documents moved here with RS-04 — the documents hang
// off an AI program, which this entity owns.
export * from "./lib/client-documents";
// Who counts as a client this week: the weekly client status and its watchdog check read one list.
export * from "./lib/active-clients";
// The roadmap writes as one value, for the three server pages that render the
// editors: they hand these down as a prop so the client door never reaches a
// "use server" module (ui/roadmap-actions-contract.ts has the reasoning).
export { ROADMAP_ACTIONS, SAVE_ROADMAP_OVERVIEW } from "./lib/roadmap-action-bundle";
