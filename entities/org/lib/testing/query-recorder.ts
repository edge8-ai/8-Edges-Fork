// A company_os client that records every query exactly, for the tests that pin
// the questions org's door answers (A.67). A copy of client-programs' recorder
// (A.66), because a test helper is not a door export, with one difference: org's
// questions build on its private helpers in lib/reads.ts, which pass a second
// `options` argument to `select` that is undefined unless a count is asked for.
// A trailing undefined argument is dropped from the record, so a step reads as
// the call a caller wrote (`["select", "id"]`), and the test states the query
// the way the caller used to spell it.
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
        while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
        query.steps.push([String(prop), ...args]);
        return builder;
      };
    },
  });
  return builder;
}
