import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.118.2. A vendor's website is drawn as an href in the vendors shelf, and any
// team member can add one from the team hub, which refuses a value that is not a link.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission first (ADR 0013); recorded so the
// test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => void asked.push(p) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: vi.fn(async () => ({ email: "member@example.test" })) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/finance", () => ({ insertVendors: (row: unknown) => builderFor("vendors").insert(row) }));

import { createTeamVendor } from "./actions";
import { VENDOR_TYPES } from "@/entities/company-os/client";

const ERROR = "Website isn't a web link. Paste the full address (e.g. example.com).";
const vendor = (url: string) => ({ name: "Print shop", type: VENDOR_TYPES[0], url });

beforeEach(() => {
  asked.length = 0;
  resetFake();
});

describe("vendor website · team hub", () => {
  it("is stored as https when typed without a scheme", async () => {
    script("vendors", { data: { id: "v1" } });
    expect(await createTeamVendor(vendor("printshop.vn"))).toEqual({ ok: true });
    expect(calls.map((c) => (c.payloads[0] as Record<string, unknown>).url)).toEqual(["https://printshop.vn/"]);
    expect(asked).toEqual(["team.vendors"]);
  });

  it("is refused, with nothing written, when it is not a link", async () => {
    expect(await createTeamVendor(vendor("call them"))).toEqual({ ok: false, error: ERROR });
    expect(await createTeamVendor(vendor("javascript:alert(1)"))).toEqual({ ok: false, error: ERROR });
    expect(calls).toHaveLength(0);
  });
});
