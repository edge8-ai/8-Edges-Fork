import { beforeEach, describe, expect, it } from "vitest";

// pageList's ordering (company-os's listEntity until ADR 0025). A sort key most
// rows leave empty — the equipment
// holder's display_name — sorts those rows after the rest and by a second key,
// so a list is not a block of unordered names (S.16.16). A plain sort is
// unchanged for every other list.

const orders: Array<[string, Record<string, unknown>]> = [];
function builder(): Record<string, unknown> {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
  };
  for (const op of ["select", "range", "is", "eq", "in", "or", "not", "ilike"]) b[op] = () => b;
  b.order = (col: string, opts: Record<string, unknown>) => {
    orders.push([col, opts]);
    return b;
  };
  return b;
}
import { pageList, type ListSource } from "./paged-list";

// The owner's source, as a door question hands it in; here, the recording builder.
const source = (() => builder()) as unknown as ListSource;

beforeEach(() => {
  orders.length = 0;
});

describe("pageList ordering", () => {
  it("orders by one key, as before, when nothing else is asked", async () => {
    await pageList(source, "*", { sort: "name", dir: "desc" });
    expect(orders).toEqual([["name", { ascending: false }]]);
  });

  it("puts empty keys last and breaks them by the next key, in the same direction", async () => {
    await pageList(source, "*", { sort: "holder(display_name)", dir: "desc", nullsLast: true, thenBy: ["holder(full_name)"] });
    expect(orders).toEqual([
      ["holder(display_name)", { ascending: false, nullsFirst: false }],
      ["holder(full_name)", { ascending: false, nullsFirst: false }],
    ]);
  });
});
