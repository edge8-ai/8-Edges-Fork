import { beforeEach, describe, expect, it, vi } from "vitest";

// What is pinned here is which bytes reach company_os.interactions.
//
// `logBody` exists because some transactional emails carry a secret — a temp
// password, a one-time verify link. When it is passed, that string is stored
// INSTEAD of the rendered html, so the secret never lands in the CRM timeline
// where every admin can read it. A regression here is silent: the email still
// sends, the log row still appears, and the secret is simply sitting in it.
//
// The client is built from RESEND_API_KEY at module load, so the env and the
// mocks are in place before the dynamic import.

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => send(...a) };
  },
}));

const inserted: Record<string, unknown>[] = [];
// Each test starts with every recipient matching a person; the B.14 cases below
// take the person away to reach the company match and the no-match branch.
const crm: {
  person: { id: string } | null;
  personError: { message: string } | null;
  companies: { id: string }[];
  companiesError: { message: string } | null;
} = { person: null, personError: null, companies: [], companiesError: null };
// The website_url values each companies read asked for.
const companyLookups: string[][] = [];
vi.mock("@/kernel/data/supabase", () => {
  const builder = (table: string): Record<string, unknown> => ({
    select: () => builder(table),
    eq: () => builder(table),
    is: () => builder(table),
    ilike: () => builder(table),
    limit: () => builder(table),
    in: (_column: string, values: string[]) => {
      companyLookups.push(values);
      return builder(table);
    },
    maybeSingle: async () => ({ data: crm.person, error: crm.personError }),
    // The companies read is awaited as a list, not through maybeSingle.
    then: (resolve: (v: unknown) => unknown) =>
      resolve(table === "companies" ? { data: crm.companiesError ? null : crm.companies, error: crm.companiesError } : { data: null, error: null }),
    insert: async (row: Record<string, unknown>) => {
      inserted.push(row);
      return { error: null };
    },
  });
  return { companyOs: { from: (table: string) => builder(table) } };
});

const audits: { context?: Record<string, unknown> }[] = [];
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: async (a: { context?: Record<string, unknown> }) => {
    audits.push(a);
  },
}));

process.env.RESEND_API_KEY = "re_test_key_not_real";

const { sendEventTicketEmail, sendTransactionalEmail } = await import("./email");

const HTML = "<p>Your temporary password is hunter2</p>";

beforeEach(() => {
  inserted.length = 0;
  audits.length = 0;
  companyLookups.length = 0;
  crm.person = { id: "person-1" };
  crm.personError = null;
  crm.companies = [];
  crm.companiesError = null;
  send.mockReset();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

describe("sendTransactionalEmail — what gets persisted", () => {
  it("stores logBody instead of the html when logBody is given", async () => {
    const ok = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Your account",
      html: HTML,
      logBody: "Temporary password email (body withheld).",
    });

    expect(ok).toBe(true);
    // The email itself still carries the real html…
    expect(send.mock.calls[0][0].html).toBe(HTML);
    // …but the CRM row must not.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].body).toBe("Temporary password email (body withheld).");
    expect(JSON.stringify(inserted[0])).not.toContain("hunter2");
  });

  it("stores the html when no logBody is given", async () => {
    // The default is deliberate: an ordinary transactional email is meant to be
    // readable on the contact's timeline. `logBody` is the opt-out, so any
    // email carrying a secret has to pass it.
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>plain</p>" });
    expect(inserted[0].body).toBe("<p>plain</p>");
  });

  it("stores an empty logBody rather than falling back to the html", async () => {
    // `??`, not `||` — an empty string is a deliberate "log nothing", and a
    // fallback here would put the secret back.
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: HTML, logBody: "" });
    expect(inserted[0].body).toBe("");
  });

  it("writes one row per recipient, each lowercased and trimmed", async () => {
    await sendTransactionalEmail({
      to: [" A@Example.com ", "b@example.com"],
      subject: "Hi",
      html: "<p>x</p>",
      logMeta: { source: "test" },
    });
    expect(inserted).toHaveLength(2);
    expect((inserted[0].metadata as Record<string, unknown>).to).toBe("a@example.com");
    expect((inserted[1].metadata as Record<string, unknown>).to).toBe("b@example.com");
    // logMeta rides along without displacing the fixed fields.
    expect(inserted[0].metadata).toMatchObject({ source: "test", format: "html" });
    expect(inserted[0].kind).toBe("email");
  });

  it("persists nothing at all when Resend rejects the send", async () => {
    send.mockResolvedValue({ data: null, error: { message: "nope" } });
    const ok = await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hi",
      html: HTML,
      logBody: "withheld",
    });
    expect(ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("sends with the default sender unless `from` overrides it", async () => {
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>x</p>" });
    expect(send.mock.calls[0][0].from).toBe("Test Sender <notifications@example.com>");

    await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Hi",
      html: "<p>x</p>",
      from: "Someone <someone@example.com>",
    });
    expect(send.mock.calls[1][0].from).toBe("Someone <someone@example.com>");
  });

  it("omits replyTo entirely rather than sending it undefined", async () => {
    await sendTransactionalEmail({ to: "a@example.com", subject: "Hi", html: "<p>x</p>" });
    expect("replyTo" in send.mock.calls[0][0]).toBe(false);
  });
});

// B.15. A sender that forgets `logBody` must still store no sign-in credential:
// logSentEmail redacts every sign-in link from whatever body it is about to
// write, the html or the logBody. The email itself is untouched, because the
// recipient needs the link.
describe("sendTransactionalEmail — the sign-in link backstop", () => {
  const TOKEN = "3f9c1d2e7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";
  const VERIFY = `https://example.com/team/verify?token_hash=${TOKEN}&type=magiclink`;
  const SIGN_IN_HTML = `<p>Here is your sign-in link:</p><p><a href="${VERIFY}">Sign in</a></p><p>Or go to <a href="https://example.com/team/login">the login page</a>.</p>`;

  it("stores the html without its sign-in link when no logBody is given", async () => {
    await sendTransactionalEmail({ to: "a@example.com", subject: "Sign in", html: SIGN_IN_HTML });

    expect(send.mock.calls[0][0].html).toBe(SIGN_IN_HTML);
    expect(inserted).toHaveLength(1);
    const body = inserted[0].body as string;
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain("token_hash");
    expect(body).toContain("[sign-in link removed]");
    // The rest of the email, the login-page link included, is kept as it was.
    expect(body).toContain("Here is your sign-in link:");
    expect(body).toContain('href="https://example.com/team/login"');
    expect(JSON.stringify(inserted[0])).not.toContain(TOKEN);
  });

  it("redacts a sign-in link that a logBody carries too", async () => {
    await sendTransactionalEmail({
      to: "a@example.com",
      subject: "Sign in",
      html: SIGN_IN_HTML,
      logBody: `<p>Link sent: ${VERIFY}</p>`,
    });
    expect(inserted[0].body).toBe("<p>Link sent: [sign-in link removed]</p>");
  });

  it("redacts Supabase's raw action_link on every recipient's row", async () => {
    const raw = `https://proj.supabase.co/auth/v1/verify?token=${TOKEN}&type=magiclink&redirect_to=https://example.com/portal/callback`;
    await sendTransactionalEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Sign in",
      html: `<a href="${raw}">Sign in</a>`,
    });
    expect(inserted).toHaveLength(2);
    for (const row of inserted) expect(JSON.stringify(row)).not.toContain(TOKEN);
  });
});

// B.14. interactions is the CRM timeline of people and companies, and its
// interactions_check refuses a row that names neither. The log used to insert a
// row for every recipient with only person_id, so every email to an address
// outside the CRM failed its insert and logged an error. A recipient is now
// matched to a person by email, else to a company by the address's domain, and
// an address that matches neither has no timeline to join: nothing is inserted
// and one info line says so, without the address.
describe("sendTransactionalEmail — whose timeline a sent email joins", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  beforeEach(() => {
    info.mockClear();
    error.mockClear();
  });

  it("logs to the person when the address is a person in the CRM", async () => {
    await sendTransactionalEmail({ to: "a@acme.com", subject: "Hi", html: "<p>x</p>" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ person_id: "person-1", company_id: null });
    // A person match needs no company read.
    expect(companyLookups).toHaveLength(0);
  });

  it("logs to the company whose website is the address's domain when no person matches", async () => {
    crm.person = null;
    crm.companies = [{ id: "company-1" }];
    await sendTransactionalEmail({ to: " Someone@Acme.COM ", subject: "Hi", html: "<p>x</p>" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ person_id: null, company_id: "company-1" });
    // website_url holds a bare host or the https URL the edit form writes, with
    // or without www; every one of those spellings is asked for.
    expect(companyLookups).toHaveLength(1);
    expect(companyLookups[0]).toEqual(
      expect.arrayContaining(["acme.com", "www.acme.com", "https://acme.com/", "https://www.acme.com/"]),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("inserts nothing for a free-mail address and says so as info, never naming it", async () => {
    crm.person = null;
    crm.companies = [{ id: "company-1" }];
    await sendTransactionalEmail({ to: "someone@gmail.com", subject: "Your ticket", html: "<p>x</p>", logMeta: { source: "events" } });
    expect(inserted).toHaveLength(0);
    // A free-mail domain says nothing about an employer, so it is never looked up.
    expect(companyLookups).toHaveLength(0);
    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0].join(" ");
    expect(line).toContain("Your ticket");
    expect(line).toContain("events");
    expect(line).not.toContain("someone");
    expect(line).not.toContain("gmail");
    expect(error).not.toHaveBeenCalled();
  });

  it("inserts nothing for an address at a domain no company has, and logs info not error", async () => {
    crm.person = null;
    await sendTransactionalEmail({ to: "x@unknown.example", subject: "Hi", html: "<p>x</p>" });
    expect(inserted).toHaveLength(0);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0].join(" ")).toContain("system");
    expect(error).not.toHaveBeenCalled();
  });

  it("inserts nothing when two companies share the domain: a guess could be the wrong timeline", async () => {
    crm.person = null;
    crm.companies = [{ id: "company-1" }, { id: "company-2" }];
    await sendTransactionalEmail({ to: "x@acme.com", subject: "Hi", html: "<p>x</p>" });
    expect(inserted).toHaveLength(0);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("logs each recipient on its own: a matched one is kept when another matches nothing", async () => {
    crm.person = null;
    crm.companies = [{ id: "company-1" }];
    await sendTransactionalEmail({ to: ["a@acme.com", "b@gmail.com"], subject: "Hi", html: "<p>x</p>" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ company_id: "company-1" });
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("treats a failed people read as a failure, not as an address outside the CRM", async () => {
    crm.personError = { message: "connection reset" };
    const ok = await sendTransactionalEmail({ to: "a@acme.com", subject: "Hi", html: "<p>x</p>" });
    // The email went; only its log row is lost, and loudly.
    expect(ok).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(companyLookups).toHaveLength(0);
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0].join(" ")).not.toContain("a@acme.com");
  });

  it("treats a failed companies read as a failure too", async () => {
    crm.person = null;
    crm.companiesError = { message: "timeout" };
    expect(await sendTransactionalEmail({ to: "a@acme.com", subject: "Hi", html: "<p>x</p>" })).toBe(true);
    expect(inserted).toHaveLength(0);
    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("still removes a sign-in link from a body logged to a company (B.15)", async () => {
    crm.person = null;
    crm.companies = [{ id: "company-1" }];
    const token = "3f9c1d2e7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c";
    await sendTransactionalEmail({
      to: "a@acme.com",
      subject: "Sign in",
      html: `<a href="https://example.com/team/verify?token_hash=${token}&type=magiclink">Sign in</a>`,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].company_id).toBe("company-1");
    expect(JSON.stringify(inserted[0])).not.toContain(token);
    expect(inserted[0].body).toContain("[sign-in link removed]");
  });
});

// Y.64. A once-only email (the onboarding milestones) is claimed before it is
// sent, and a thrown send hands the claim back, so tomorrow's run sends again.
// When Resend took the email but the reply was lost, that is a second email to
// the same person. With an idempotency key the send retries once, at once,
// inside Resend's 24-hour memory of the key: a repeat of a request it already
// took returns the first answer and sends nothing.
describe("sendTransactionalEmail — an idempotency key and one retry", () => {
  const KEY = "onboarding/day8/j1";
  const mail = { to: "a@example.com", subject: "One week in", html: "<p>x</p>", idempotencyKey: KEY };
  const serverError = { data: null, error: { name: "internal_server_error", statusCode: 500, message: "boom" } };
  const conflict = { data: null, error: { name: "invalid_idempotent_request", statusCode: 409, message: "same key, different body" } };

  it("hands the key to Resend as its idempotency key", async () => {
    await sendTransactionalEmail(mail);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: KEY });
    expect("idempotencyKey" in send.mock.calls[0][0]).toBe(false);
  });

  it("retries a thrown send exactly once, with the same body and key", async () => {
    send.mockRejectedValueOnce(new Error("socket hang up"));
    const ok = await sendTransactionalEmail(mail);
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(inserted).toHaveLength(1);
  });

  it("retries a 5xx once, with the same body and key", async () => {
    send.mockResolvedValueOnce(serverError);
    expect(await sendTransactionalEmail(mail)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  });

  it("retries a reply that never arrived, which the SDK reports with no status", async () => {
    // resend's fetch wrapper catches a network failure and returns it as an
    // error with statusCode null: the lost-reply case the key exists for.
    send.mockResolvedValueOnce({ data: null, error: { name: "application_error", statusCode: null, message: "Unable to fetch data." } });
    expect(await sendTransactionalEmail(mail)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("retries only once: a second failure is the caller's to handle", async () => {
    send.mockResolvedValue(serverError);
    expect(await sendTransactionalEmail(mail)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);

    send.mockReset();
    send.mockRejectedValue(new Error("down"));
    await expect(sendTransactionalEmail(mail)).rejects.toThrow("down");
    expect(send).toHaveBeenCalledTimes(2);

    // A throw and then a 5xx is still one retry, not two.
    send.mockReset();
    send.mockRejectedValueOnce(new Error("down")).mockResolvedValue(serverError);
    expect(await sendTransactionalEmail(mail)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(inserted).toHaveLength(0);
  });

  it("does not retry a refusal: a 4xx will be refused again", async () => {
    send.mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "bad from" } });
    expect(await sendTransactionalEmail(mail)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("counts a 409 as sent but unconfirmed: audited, logged, never re-sent", async () => {
    // Resend answers a reused key with a 409 when the body differs or the
    // first request is still in flight. Either way an email went under this
    // key, so sending again, or handing the claim back, would be the repeat.
    send.mockResolvedValue(conflict);
    expect(await sendTransactionalEmail(mail)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
    expect(audits[0].context).toMatchObject({ action: "email_unconfirmed", idempotency_key: KEY });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].metadata).toMatchObject({ delivery: "unconfirmed", idempotency_key: KEY });
  });

  it("counts a 409 on the retry the same way", async () => {
    send.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(conflict);
    expect(await sendTransactionalEmail(mail)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(audits).toHaveLength(1);
  });

  it("without a key nothing changes: no option, no retry, a throw still throws", async () => {
    const plain = { to: mail.to, subject: mail.subject, html: mail.html };
    await sendTransactionalEmail(plain);
    expect(send.mock.calls[0]).toHaveLength(1);

    send.mockReset();
    send.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(sendTransactionalEmail(plain)).rejects.toThrow("socket hang up");
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue(serverError);
    expect(await sendTransactionalEmail(plain)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);

    send.mockReset();
    send.mockResolvedValue(conflict);
    expect(await sendTransactionalEmail(plain)).toBe(false);
    expect(audits).toHaveLength(0);
  });
});

describe("sendEventTicketEmail — the greeting", () => {
  // The caller passes greetingName's answer; the kernel prints it as given. It
  // used to take the first word, which for a Vietnamese-order full name is the
  // family name ("Hi Nguyễn,") (S.16.16).
  const ticket = { to: "a@example.com", eventTitle: "Retreat", dateLabel: "1 Nov", location: null, ticketUrl: "https://x.test/t" };

  it("prints the name it is given whole, escaped", async () => {
    await sendEventTicketEmail({ ...ticket, name: "Mary <Ann>" });
    expect(send.mock.calls[0][0].html).toContain("Hi Mary &lt;Ann&gt;,");
  });

  it("says \"there\" when there is no name", async () => {
    await sendEventTicketEmail({ ...ticket, name: null });
    expect(send.mock.calls[0][0].html).toContain("Hi there,");
  });
});
