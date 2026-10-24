import { beforeEach, describe, expect, it, vi } from "vitest";

// A survey that names a chat posts each response's answers there; one that
// names none, or names a chat that does not exist, posts nothing extra.

const product = vi.fn(async (_m: unknown) => true);
const eo = vi.fn(async (_m: unknown) => true);
vi.mock("@/kernel/messaging/lark", () => ({
  notifyProduct: (m: unknown) => product(m),
  notifyEo: (m: unknown) => eo(m),
  notifyMarketing: async () => true,
}));

import { notifySurveyChat, surveyResultsMessage } from "./survey-chat-notify";

const fields = [
  { id: "f1", label: "Modules" },
  { id: "f2", label: "Start with" },
];
const answers = [
  { field_id: "f1", value: "CRM & Commerce, Marketing" },
  { field_id: "f2", value: "CRM & Commerce" },
];

beforeEach(() => {
  product.mockClear();
  eo.mockClear();
});

describe("surveyResultsMessage", () => {
  it("lists each question with its answer under the survey and the respondent", () => {
    expect(surveyResultsMessage("Choose your 8 Edges", "Sam <sam@example.test> (external)", fields, answers)).toBe(
      "📋 Choose your 8 Edges\nSam <sam@example.test> (external)\n\nModules: CRM & Commerce, Marketing\nStart with: CRM & Commerce",
    );
  });
});

describe("notifySurveyChat", () => {
  it("posts to the chat the survey names", async () => {
    await notifySurveyChat({ name: "Choose your 8 Edges", metadata: { notify_chat: "product" } }, "Sam", fields, answers);
    expect(product).toHaveBeenCalledTimes(1);
    expect(product.mock.calls[0][0]).toContain("Start with: CRM & Commerce");
    expect(eo).not.toHaveBeenCalled();
  });

  it("posts nothing for a survey that names no chat, or an unknown one", async () => {
    await notifySurveyChat({ name: "x", metadata: {} }, "Sam", fields, answers);
    await notifySurveyChat({ name: "x", metadata: null }, "Sam", fields, answers);
    await notifySurveyChat({ name: "x", metadata: { notify_chat: "everyone" } }, "Sam", fields, answers);
    expect(product).not.toHaveBeenCalled();
    expect(eo).not.toHaveBeenCalled();
  });

  it("never throws when the chat post fails", async () => {
    product.mockImplementationOnce(async () => {
      throw new Error("webhook down");
    });
    await expect(notifySurveyChat({ name: "x", metadata: { notify_chat: "product" } }, "Sam", fields, answers)).resolves.toBeUndefined();
  });
});
