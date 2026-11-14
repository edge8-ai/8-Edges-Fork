import { beforeEach, describe, expect, it, vi } from "vitest";

// A.56: every read of people by email goes through this module. The fake
// below records each builder call with its arguments, order included, because
// "oldest first" is the promise a caller taking the first row relies on, and
// the shared fake keeps no arguments for `order`.

type Op = [string, ...unknown[]];
type Answer = { data?: unknown; error?: { message: string } | null };
const queries: { table: string; ops: Op[] }[] = [];
let answers: Answer[] = [];

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      const record = { table, ops: [] as Op[] };
      queries.push(record);
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              const next = answers.shift();
              if (!next) throw new Error(`unscripted query against ${table}`);
              return { data: next.data ?? null, error: next.error ?? null };
            })
            .then(resolve, reject),
      };
      for (const op of ["select", "is", "ilike", "filter", "or", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          record.ops.push([op, ...args]);
          return builder;
        };
      }
      return builder;
    },
  },
}));

import { peopleByEmail, peopleByEmails, personIdForEmail, personIdForEmailOrNull } from "./person-by-email";
import { ReadFailure } from "@/kernel/data/read";

const answer = (...xs: Answer[]) => answers.push(...xs);
const ORDERED: Op[] = [
  ["order", "created_at", { ascending: true }],
  ["order", "id", { ascending: true }],
];

beforeEach(() => {
  queries.length = 0;
  answers = [];
});

describe("peopleByEmail", () => {
  it.each([
    ["an ordinary address", "sam@client.example", ["ilike", "email", "sam@client.example"]],
    ["capitals, kept as typed (ilike ignores case)", "Sam.Lee@Client.Example", ["ilike", "email", "Sam.Lee@Client.Example"]],
    ["surrounding space, trimmed", "  sam@client.example ", ["ilike", "email", "sam@client.example"]],
    ["`_`, escaped so it matches only itself", "first_last@client.example", ["ilike", "email", "first\\_last@client.example"]],
    ["`%`, escaped so it matches only itself", "%@client.example", ["ilike", "email", "\\%@client.example"]],
    ["`*`, which PostgREST reads as `%`: no row can match", "a*b@client.example", ["filter", "email", "in", "()"]],
  ])("matches %s literally", async (_label, email, match) => {
    answer({ data: [] });
    await peopleByEmail(email);
    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe("people");
    expect(queries[0].ops).toContainEqual(match);
  });

  it("leaves archived people out by default, oldest first", async () => {
    answer({ data: [] });
    await peopleByEmail("sam@client.example");
    expect(queries[0].ops).toEqual([["select", "id"], ["is", "archived_at", null], ["ilike", "email", "sam@client.example"], ...ORDERED]);
  });

  it("counts archived people when the caller says include", async () => {
    answer({ data: [] });
    await peopleByEmail("sam@client.example", { columns: "id, source", archived: "include" });
    expect(queries[0].ops).toEqual([["select", "id, source"], ["ilike", "email", "sam@client.example"], ...ORDERED]);
  });

  it("answers every match, in the order read, so a duplicated address is never cut to an arbitrary row", async () => {
    answer({ data: [{ id: "p-old" }, { id: "p-new" }] });
    expect(await peopleByEmail("sam@client.example")).toEqual({ data: [{ id: "p-old" }, { id: "p-new" }], error: null });
    expect(queries[0].ops.some(([op]) => op === "limit")).toBe(false);
  });

  it("asks nothing for a blank address", async () => {
    for (const blank of [null, undefined, "", "   "]) expect(await peopleByEmail(blank)).toEqual({ data: [], error: null });
    expect(queries).toHaveLength(0);
  });

  it("hands a failed read back to the caller, who says what it means", async () => {
    answer({ error: { message: "timeout" } });
    expect(await peopleByEmail("sam@client.example")).toEqual({ data: null, error: { message: "timeout" } });
  });
});

describe("personIdForEmail", () => {
  it("is the oldest unarchived match", async () => {
    answer({ data: [{ id: "p-old" }, { id: "p-new" }] });
    expect(await personIdForEmail("Sam@Client.Example")).toBe("p-old");
    expect(queries[0].ops).toContainEqual(["is", "archived_at", null]);
  });

  it("is null for nobody, and raises on a failed read", async () => {
    answer({ data: [] }, { error: { message: "timeout" } });
    expect(await personIdForEmail("sam@client.example")).toBeNull();
    await expect(personIdForEmail("sam@client.example")).rejects.toBeInstanceOf(ReadFailure);
  });

  it("answers null rather than raising when only a name is at stake", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    answer({ error: { message: "timeout" } });
    expect(await personIdForEmailOrNull("sam@client.example", "test")).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("peopleByEmails", () => {
  it("reads each address once, lower-cased, as one quoted literal condition", async () => {
    answer({ data: [] });
    await peopleByEmails(["Sam@Client.Example", "sam@client.example", null, "", "first_last@client.example"]);
    expect(queries).toHaveLength(1);
    expect(queries[0].ops).toEqual([
      ["select", "id, email"],
      ["is", "archived_at", null],
      ["or", 'email.ilike."sam@client.example",email.ilike."first\\\\_last@client.example"'],
      ...ORDERED,
    ]);
  });

  it("escapes a quote in an address rather than letting it end the condition", async () => {
    answer({ data: [] });
    await peopleByEmails(['x"y@client.example'], { archived: "include" });
    expect(queries[0].ops).toContainEqual(["or", 'email.ilike."x\\"y@client.example"']);
  });

  it("leaves out an address holding `*`, and asks nothing when none is left", async () => {
    answer({ data: [] });
    await peopleByEmails(["a*b@client.example", "c@client.example"]);
    expect(queries[0].ops).toContainEqual(["or", 'email.ilike."c@client.example"']);
    queries.length = 0;
    expect(await peopleByEmails(["a*b@client.example"])).toEqual({ data: [], error: null });
    expect(queries).toHaveLength(0);
  });

  it("keeps only rows whose address is in the list, whatever their capitals", async () => {
    answer({
      data: [
        { id: "p-sam", email: "Sam.Lee@Client.Example" },
        { id: "p-wild", email: "samXlee@client.example" },
        { id: "p-none", email: null },
      ],
    });
    expect((await peopleByEmails(["sam.lee@client.example"])).data).toEqual([{ id: "p-sam", email: "Sam.Lee@Client.Example" }]);
  });

  it("reads email for the recheck when the caller's columns leave it out", async () => {
    answer({ data: [{ id: "p-sam", full_name: "Sam Lee", email: "sam@client.example" }] });
    const read = await peopleByEmails(["sam@client.example"], { columns: "id, full_name", archived: "include" });
    expect(queries[0].ops[0]).toEqual(["select", "id, full_name, email"]);
    expect(read.data).toHaveLength(1);
  });

  it("reads a long list in groups of fifty and joins the answers", async () => {
    const emails = Array.from({ length: 120 }, (_, i) => `person${i}@client.example`);
    answer({ data: [{ id: "a", email: "person0@client.example" }] }, { data: [{ id: "b", email: "person50@client.example" }] }, { data: [] });
    const read = await peopleByEmails(emails);
    const sizes = queries.map((q) => String(q.ops.find(([op]) => op === "or")?.[1]).split(",").length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(read.data?.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("fails as a whole when any group's read fails", async () => {
    const emails = Array.from({ length: 60 }, (_, i) => `person${i}@client.example`);
    answer({ data: [] }, { error: { message: "timeout" } });
    expect(await peopleByEmails(emails)).toEqual({ data: null, error: { message: "timeout" } });
  });
});
