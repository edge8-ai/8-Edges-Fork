// A recording stand-in for the company_os client, for the tests of hiring's
// door questions (A.69, ADR 0018). A copy of finance's (A.65): one entity's
// test helpers are not another entity's door.
//
// A question promises that each caller it replaced still makes the query it
// made before: the same table, columns, filters, order, limit and
// single/maybeSingle/head/count. The kernel's fake
// (kernel/data/testing/fake-company-os.ts) keeps filters and written rows but
// drops the select's columns and the order and limit arguments, which are
// exactly the parts this promise is about. This one keeps every call, with its
// arguments, in the order the question made it, so a test can compare the
// whole query to the one the caller used to build by hand.
export type Step = [string, ...unknown[]];
export type Query = { table: string; steps: Step[] };

export const queries: Query[] = [];
const answers: unknown[] = [];

/** The next answers, in order; an unscripted query answers no rows and no error. */
export function answerNext(...responses: unknown[]): void {
  answers.push(...responses);
}

export function resetQueries(): void {
  queries.length = 0;
  answers.length = 0;
}

function chain(query: Query): unknown {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(answers.length > 0 ? answers.shift() : { data: [], error: null }).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          query.steps.push([String(prop), ...args]);
          return builder;
        };
      },
    },
  );
  return builder;
}

export const recordingClient = {
  from(table: string): unknown {
    const query: Query = { table, steps: [] };
    queries.push(query);
    return chain(query);
  },
  rpc(fn: string, args: unknown): unknown {
    const query: Query = { table: `rpc:${fn}`, steps: [["rpc", args]] };
    queries.push(query);
    return chain(query);
  },
};
