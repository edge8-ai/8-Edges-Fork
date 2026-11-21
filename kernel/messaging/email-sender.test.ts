import { afterEach, describe, expect, it, vi } from "vitest";

// The boot line an instance with no email sender prints (CI.4), so the mode in
// which invites hand out temporary passwords is visible in the logs, not inferred.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
afterEach(() => {
  for (const [k, v] of [["RESEND_API_KEY", saved.key], ["EMAIL_FROM", saved.from]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
});

async function load(env: { key?: string; from?: string }) {
  vi.resetModules();
  if (env.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = env.key;
  if (env.from === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = env.from;
  return import("./email");
}

describe("emailSenderBootWarning", () => {
  it("is silent when the instance can send", async () => {
    const m = await load({ key: "re_test", from: "Acme <hi@acme.test>" });
    expect(m.canSendEmail()).toBe(true);
    expect(m.emailSenderBootWarning()).toBeNull();
  });

  it.each([
    [{ from: "Acme <hi@acme.test>" }, "RESEND_API_KEY"],
    [{ key: "re_test" }, "EMAIL_FROM"],
    [{}, "RESEND_API_KEY, EMAIL_FROM"],
  ])("names what is missing and what invites do instead (%o)", async (env, missing) => {
    const m = await load(env);
    expect(m.canSendEmail()).toBe(false);
    expect(m.emailSenderBootWarning()).toBe(
      `no email sender (${missing} not set): nothing is emailed, and invites from Settings → Access hand the admin a temporary password instead.`,
    );
  });
});
