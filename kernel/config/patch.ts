// Turning a parsed form/action input into a PostgREST patch body.
//
// The two things every admin update action needs from that conversion:
//   - a key the caller did not send is absent, not `undefined` — PostgREST
//     serializes an `undefined` value as a null write, so leaving it in would
//     blank a column the form never touched;
//   - an empty string is `null`, because an emptied optional text field means
//     "clear this", not "store the empty string".
//
// Actions whose columns need more than that (arrays to trim, numeric strings to
// coerce) keep their own richer `clean` next to the schema that defines them.
// Generic in the input so the result keeps the caller's key names: with the
// service-role clients typed against the generated schema, a patch typed
// `Record<string, unknown>` would defeat PostgREST's column checking, while
// `Partial<T>` lets `.update()` reject a key that is not a column.
// The one place the type is looser than the runtime: an emptied optional text
// field becomes `null`, so a caller patching a NOT NULL column must reject the
// empty string itself before calling this (the admin actions do).
export function toPatch<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out as Partial<T>;
}
