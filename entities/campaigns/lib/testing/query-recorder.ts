// A company_os client that records every query exactly, for the tests that pin
// the questions campaigns' door answers (A.70). A copy of boards' recorder
// (A.68), because a test helper is not a door export. The kernel fake
// (kernel/data/testing/fake-company-os.ts) keeps filters and written rows but
// not a select's columns, an order or a limit, and those are half of what a
// question promises. Here each `from(table)` records every chained call with
// its arguments, in order, and answers `{ data: null, error: null }`, so a test
// states the whole query a caller used to build and the question now builds.
// Mock the client with it: `vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }))`.

export type Step = [string, ...unknown[]];
export type RecordedQuery = { table: string; steps: Step[] };

export const queries: RecordedQuery[] = [];

export function resetQueries(): void {
  queries.length = 0;
}

type Recording = PromiseLike<{ data: null; error: null; count: null }> & Record<string, (...args: unknown[]) => Recording>;

export function recordingFrom(table: string): Recording {
  const query: RecordedQuery = { table, steps: [] };
  queries.push(query);
  const builder: Recording = new Proxy({} as Recording, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, count: null }).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        query.steps.push([String(prop), ...args]);
        return builder;
      };
    },
  });
  return builder;
}
