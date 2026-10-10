import { beforeEach, describe, expect, it, vi } from "vitest";

// K.78. key_results.current_value defaults to 0, so a key result nobody has
// checked in read "0 of 4.5 score" under a member's goal. "Never measured" is
// the default 0 with no audited change and no check-in log; a 0 somebody set on
// purpose keeps reading as 0, and a failed read claims nothing.

let auditRows: unknown[] | null = [];
let logRows: unknown[] | null = [];
const fail = { message: "boom" };

function builder(rows: () => unknown[] | null) {
  const b = {
    select: () => b,
    eq: () => b,
    in: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      const data = rows();
      return Promise.resolve(data === null ? { data: null, error: fail } : { data, error: null }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: () => builder(() => auditRows) } }));
vi.mock("@/entities/org", () => ({ selectKrLogs: () => builder(() => logRows) }));

const { getNeverMeasuredKeyResults } = await import("./key-result-measured");

const krs = [
  { id: "csat", current_value: 0 },
  { id: "typed-zero", current_value: 0 },
  { id: "synced", current_value: 0 },
  { id: "moving", current_value: 25 },
];

beforeEach(() => {
  auditRows = [
    // A title edit leaves the value alone: not a measurement.
    { record_id: "csat", old_data: { current_value: 0 }, new_data: { current_value: 0 } },
    // Someone checked it in at 0 on purpose.
    { record_id: "typed-zero", old_data: { current_value: 10 }, new_data: { current_value: 0 } },
  ];
  logRows = [{ key_result_id: "synced" }];
});

describe("getNeverMeasuredKeyResults", () => {
  it("names only the zero nobody ever measured", async () => {
    expect([...(await getNeverMeasuredKeyResults(krs))]).toEqual(["csat"]);
  });
  it("claims nothing when a read fails", async () => {
    auditRows = null;
    expect((await getNeverMeasuredKeyResults(krs)).size).toBe(0);
  });
  it("reads nothing when no key result sits at the default", async () => {
    expect((await getNeverMeasuredKeyResults([{ id: "moving", current_value: 25 }])).size).toBe(0);
  });
});
