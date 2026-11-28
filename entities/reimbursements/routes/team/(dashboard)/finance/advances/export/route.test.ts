import { beforeEach, describe, expect, it, vi } from "vitest";

// The export's route: the guard first, a month it can read, and a file nobody stores.
const asked = vi.hoisted(() => [] as string[]);
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/entities/reimbursements/lib/export", () => ({ isExportMonth: (m: string) => /^\d{4}-\d{2}$/.test(m) }));
const months = vi.hoisted(() => [] as string[]);
vi.mock("@/entities/reimbursements/lib/advance-export", () => ({
  readAdvancesForExport: async () => [],
  account141Csv: (_a: unknown, month: string) => (months.push(month), "the,file"),
}));

import { GET } from "./route";

const get = (query: string) => GET(new Request(`https://os.example/team/finance/advances/export${query}`));

beforeEach(() => {
  asked.length = 0;
  months.length = 0;
});

describe("the account 141 export", () => {
  it("asks for reimbursements.pay first, and answers a named file nobody caches", async () => {
    const res = await get("?month=2026-11");
    expect(asked).toEqual(["reimbursements.pay"]);
    expect(months).toEqual(["2026-11"]);
    expect(await res.text()).toBe("the,file");
    expect(res.headers.get("Content-Disposition")).toContain("account-141-2026-11.csv");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("refuses a month it cannot read", async () => {
    expect((await get("?month=soon")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(months).toEqual([]);
  });
});
