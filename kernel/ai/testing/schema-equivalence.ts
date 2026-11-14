// Canonicalises a JSON schema so a derived one can be compared against the
// hand-written one it replaces.
//
// This is the harness that makes A.4's sweep reviewable. Fifteen call sites
// each had their Zod schema transcribed by hand from an existing json_schema,
// and a transcription slip yields a schema that is valid but wrong — which a
// golden snapshot cannot catch, because a snapshot pins what the Zod emits and
// not that the Zod says what was there before. Comparing the two artifacts is
// the only check that does, and a machine is better at it than a reviewer.
//
// Two differences are normalised away, and each is named because each is a
// difference of spelling and not of request:
//
//  - `.nullable()` emits `anyOf: [{type:"X"}, {type:"null"}]` where the
//    hand-written schemas wrote `type: ["X","null"]`. Both forms collapse to
//    the second, with the non-null branch's own keys (`enum`, `items`,
//    `properties`) flattened up beside the annotations (`description`) that
//    sat outside it.
//  - `required` is sorted. It is a set in JSON Schema, and a hand-written one
//    frequently listed its keys in an order the `properties` block did not
//    follow (`step-seo.ts` is the live case). `properties` order is NOT
//    normalised: that is the order the model reads the schema in, so a change
//    to it is a change to the request.
//
// `$schema` is stripped too, but `jsonSchemaFor` has already done that; a
// hand-written schema never had one.
//
// Nothing else is normalised. A difference this does not name is a difference
// worth failing on.
export function canonicalSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonicalSchema);
  if (node === null || typeof node !== "object") return node;

  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === "$schema") continue;
    if (key === "required" && Array.isArray(value)) {
      out[key] = [...(value as string[])].sort();
      continue;
    }
    out[key] = canonicalSchema(value);
  }

  const nullable = splitNullableAnyOf(out.anyOf);
  if (nullable) {
    delete out.anyOf;
    const { type, ...rest } = nullable;
    Object.assign(out, rest);
    out.type = [type, "null"];
  }
  return out;
}

/**
 * The non-null branch of an `anyOf` that is exactly `[something, {type:"null"}]`,
 * or undefined when the `anyOf` is a genuine union the caller wrote on purpose.
 */
function splitNullableAnyOf(anyOf: unknown): (Record<string, unknown> & { type: unknown }) | undefined {
  if (!Array.isArray(anyOf) || anyOf.length !== 2) return undefined;
  const [first, second] = anyOf as Record<string, unknown>[];
  const isNullBranch = (b: unknown) => {
    const keys = b && typeof b === "object" ? Object.keys(b as object) : [];
    return keys.length === 1 && (b as Record<string, unknown>).type === "null";
  };
  if (!isNullBranch(second) || isNullBranch(first)) return undefined;
  if (!first || typeof first.type !== "string") return undefined;
  return first as Record<string, unknown> & { type: unknown };
}
