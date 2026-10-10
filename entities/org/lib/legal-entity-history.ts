// A legal entity's audit rows, as the sentences its History list reads.
//
// Every change to a legal entity writes one audit_log row whose old_data and
// new_data hold the fields it changed and whose context holds the reason the
// person gave (the actions beside the Settings → Legal entities page). This
// turns one such row into "Tax code 0101234567 → 0101234567-001", who, when and
// why. It is pure and names no client, so it is tested without a database and
// the page maps on the server: the browser receives the sentences, never the
// raw before and after images.
import { describeAuditOperation, type AuditEntry } from "@/kernel/audit/history";
import { formatDate } from "@/kernel/ui/format";
import { countryLabels, entityTypeLabel } from "./legal-entity-rules";

/** One change, ready to render. */
export type LegalEntityChange = {
  id: string;
  /** One sentence per field that changed; never empty. */
  lines: string[];
  /** The person's name, or what the writer stored when it could not be resolved. */
  who: string;
  /** ISO timestamp of the change. */
  at: string;
  /** The reason given with the change, when one was. */
  why: string | null;
};

const UNKNOWN_ACTOR = "Unknown";
const UNKNOWN_PERSON = "a person no longer on record";

type Shown = (value: string) => string;

/**
 * The audited fields, in the order a change lists them, what each is called
 * for this entity's country, and how a stored value reads. A field missing
 * here is still recorded; it is just not spelled out, so adding a column
 * means adding it here.
 */
function fieldsFor(country: string | null, personNames: ReadonlyMap<string, string>): [field: string, label: string, show: Shown][] {
  const labels = countryLabels(country);
  const short = (label: string) => label.split(" (")[0];
  const asIs: Shown = (v) => v;
  return [
    ["name", "Name", asIs],
    ["legal_name", "Legal name", asIs],
    ["country", "Country", asIs],
    ["entity_type", "Type", (v) => entityTypeLabel(v) ?? v],
    ["base_currency", "Currency", (v) => v.toUpperCase()],
    ["tax_id", short(labels.taxId.label), asIs],
    ["registration_number", short(labels.registrationNumber.label), asIs],
    ["registered_address", "Registered address", asIs],
    ["legal_representative_person_id", "Legal representative", (v) => personNames.get(v) ?? UNKNOWN_PERSON],
    ["jurisdiction", short(labels.jurisdiction.label), asIs],
    ["incorporated_on", "Incorporated on", (v) => formatDate(v)],
  ];
}

function present(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** The sentence for one field, decided on the stored values and worded with the shown ones. */
function fieldLine(label: string, before: string | null, after: string | null, show: Shown): string | null {
  if (before === after) return null;
  if (before === null) return `${label} set to ${show(after as string)}`;
  if (after === null) return `${label} cleared (was ${show(before)})`;
  return `${label} ${show(before)} → ${show(after)}`;
}

/** The person ids a page of changes names, so the caller can resolve them in one read. */
export function representativeIds(entries: AuditEntry[]): string[] {
  const ids = new Set<string>();
  for (const e of entries) {
    for (const image of [e.oldData, e.newData]) {
      const id = present(image?.legal_representative_person_id);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** The sentences one audit row reads as. */
export function legalEntityChange(
  entry: AuditEntry,
  context: { country: string | null; personNames?: ReadonlyMap<string, string> } = { country: null },
): LegalEntityChange {
  const before = entry.oldData ?? {};
  const after = entry.newData ?? {};
  const lines: string[] = [];
  if (entry.operation !== "insert") {
    for (const [field, label, show] of fieldsFor(context.country, context.personNames ?? new Map())) {
      if (!(field in before) && !(field in after)) continue;
      const line = fieldLine(label, present(before[field]), present(after[field]), show);
      if (line) lines.push(line);
    }
    // The flag reads as what happened to the company, not as "true → false".
    if ("active" in after && before.active !== after.active) lines.push(after.active ? "Marked active" : "Marked inactive");
  }
  // A creation, or a row whose fields this screen does not spell out, still
  // reads as something: a history that silently drops a row is worse than one
  // that says only "Updated".
  if (lines.length === 0) lines.push(entry.operation === "insert" ? "Added" : describeAuditOperation(entry.operation));
  const reason = entry.context.reason;
  return {
    id: entry.id,
    lines,
    who: entry.actor ?? UNKNOWN_ACTOR,
    at: entry.at,
    why: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : null,
  };
}
