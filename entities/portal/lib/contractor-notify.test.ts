import { beforeEach, describe, expect, it, vi } from "vitest";

// The contractor emails print the name the caller hands them — greetingName's
// answer (S.16) — and nothing else about it: no first-word cut, no raw HTML.
// These pin that, so a change to the greeting order has something to hold.

type Sent = { to: string | string[]; subject: string; html: string };
const sent: Sent[] = [];
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: vi.fn(async (args: Sent) => {
    sent.push(args);
    return true;
  }),
}));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: vi.fn(async () => {}) }));

import { sendClientEstimateReadyEmail, sendClientWorkReadyEmail, sendWorkRequestEmail } from "./contractor-notify";

const base = { to: "c@example.test", title: "Deck", brief: "", url: "https://edge8.test/work/t" };

beforeEach(() => {
  sent.length = 0;
});

describe("contractor emails", () => {
  it("greet by the name they are given, whole", async () => {
    await sendWorkRequestEmail({ ...base, name: "Mary Ann" });
    expect(sent[0].html).toContain("Hi Mary Ann,");
  });

  it("say \"there\" when there is no name", async () => {
    await sendWorkRequestEmail({ ...base, name: null });
    expect(sent[0].html).toContain("Hi there,");
  });

  it("escape a name before printing it, since a person edits their own", async () => {
    await sendWorkRequestEmail({ ...base, name: "<b>Hiếu</b>" });
    expect(sent[0].html).toContain("Hi &lt;b&gt;Hiếu&lt;/b&gt;,");
    expect(sent[0].html).not.toContain("<b>Hiếu</b>");
  });

  it("escape the request title, which the client typed (S.16.18)", async () => {
    await sendWorkRequestEmail({ ...base, name: "Lan", title: "<b>Deck</b>" });
    await sendClientEstimateReadyEmail({
      to: "client@example.test",
      name: "Lan",
      title: "<b>Deck</b>",
      contractorName: null,
      estimatedHours: 3,
      url: "https://edge8.test/portal/requests/w1",
    } as Parameters<typeof sendClientEstimateReadyEmail>[0]);
    for (const { html } of sent) {
      expect(html).toContain("<strong>&lt;b&gt;Deck&lt;/b&gt;</strong>");
      expect(html).not.toContain("<b>Deck</b>");
    }
  });

  it("escape the contractor's name in the client's work-ready email", async () => {
    await sendClientWorkReadyEmail({
      to: "client@example.test",
      name: "Lan",
      title: "Deck",
      contractorName: "<i>Hiếu</i>",
      url: "https://edge8.test/portal/requests/w1",
    } as Parameters<typeof sendClientWorkReadyEmail>[0]);
    expect(sent[0].html).toContain("&lt;i&gt;Hiếu&lt;/i&gt; has");
  });
});
