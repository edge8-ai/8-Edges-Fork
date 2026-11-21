import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.17 review: a broadcast send hands Resend one idempotency key per recipient,
// so a batch retried after Resend took a message but before the row was marked
// sent mails nobody twice. A send without a key (a test) is unchanged.

const sends = vi.hoisted(() => [] as unknown[][]);
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (...args: unknown[]) => {
        sends.push(args);
        return { data: { id: "re_1" }, error: null };
      },
    };
  },
}));
vi.mock("@/kernel/messaging/writes", () => ({
  insertInteractions: () => ({ select: () => ({ single: async () => ({ data: { id: "int-1" }, error: null }) }) }),
}));

process.env.RESEND_API_KEY = "re_test_not_a_real_key";
process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
process.env.MARKETING_EMAIL_FROM = "Letters <letters@example.test>";

const { sendMarketingEmail } = await import("./marketing-email");

const mail = { to: "a@example.test", personId: "p-1", subject: "This week", bodyMd: "Hello." };

beforeEach(() => {
  sends.length = 0;
});

describe("sendMarketingEmail and Resend's idempotency key", () => {
  it("hands the key to Resend as its options, not in the message", async () => {
    expect(await sendMarketingEmail({ ...mail, idempotencyKey: "campaign:c:recipient:r" })).toMatchObject({ ok: true });
    expect(sends[0][1]).toEqual({ idempotencyKey: "campaign:c:recipient:r" });
    expect("idempotencyKey" in (sends[0][0] as Record<string, unknown>)).toBe(false);
  });

  it("sends with no options when there is no key", async () => {
    await sendMarketingEmail(mail);
    expect(sends[0]).toHaveLength(1);
  });
});
