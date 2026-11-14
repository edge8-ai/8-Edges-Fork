import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.43: the Lark log keeps a failed send with its reason, and no logged body
// or subject carries a sign-in link.

const inserts: Record<string, unknown>[] = [];
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => "person-1" }));

const { logLarkMessage } = await import("./lark-log");
const { SIGN_IN_LINK_MARKER } = await import("./sign-in-links");

beforeEach(() => {
  inserts.length = 0;
});

describe("logLarkMessage", () => {
  it("records a failed send with its reason", async () => {
    await logLarkMessage({ message: "Morning", category: "workboard", source: "lark_webhook:product", chat: "product", failed: "code 9499 bot not found" });
    expect(inserts[0]).toMatchObject({ kind: "lark", subject: "Morning", metadata: { source: "lark_webhook:product", chat: "product", failed: "code 9499 bot not found" } });
  });

  it("leaves failed out of a delivered message", async () => {
    await logLarkMessage({ message: "Morning", category: "workboard", source: "lark_webhook:product", chat: "product" });
    expect(inserts[0].metadata).not.toHaveProperty("failed");
  });

  it("logs a direct message by default", async () => {
    await logLarkMessage({ message: "Due soon", category: "other", source: "lark_dm", email: "a@example.com" });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ kind: "lark", person_id: "person-1" });
  });

  it("writes no row, delivered or failed, for a staff-private DM (crmLog: false)", async () => {
    await logLarkMessage({ message: "Due soon", category: "other", source: "lark_dm", email: "a@example.com", crmLog: false });
    await logLarkMessage({ message: "Due soon", category: "other", source: "lark_dm", email: "a@example.com", failed: "code 1", crmLog: false });
    expect(inserts).toHaveLength(0);
  });

  it("removes a sign-in link from the body and subject", async () => {
    const link = "https://www.example.com/auth/confirm?token_hash=abc123&type=magiclink";
    await logLarkMessage({ message: `Sign in: ${link}\\nthanks`, category: "other", source: "lark_dm", email: "a@example.com" });
    expect(String(inserts[0].body)).not.toContain("token_hash=abc123");
    expect(String(inserts[0].body)).toContain(SIGN_IN_LINK_MARKER);
    expect(String(inserts[0].subject)).not.toContain("token_hash");
  });
});
