// The shape every server action returns (the repo convention in CLAUDE.md).
// It lived on company-os's mutations helper while company-os was the only
// entity with actions; it moved here when boards became its own entity, because
// a type every entity's actions return is not any one entity's to own.
export type Result = { ok: true } | { ok: false; error: string };
