// Who gets the assistant's write and email tools. C.20 asks a person to check
// "privileged-email gating for writes" by hand; the rule is three lines of env
// parsing and this pins them, so the manual check is the Approve click only.
// Example addresses throughout: this file ships to the public fork, whose
// content scanner rejects any real internal address.
import { afterEach, describe, expect, it } from "vitest";
import { isPrivilegedChatUser } from "./privileged";

const saved = process.env.CHATBOT_PRIVILEGED_EMAILS;
afterEach(() => {
  if (saved === undefined) delete process.env.CHATBOT_PRIVILEGED_EMAILS;
  else process.env.CHATBOT_PRIVILEGED_EMAILS = saved;
});

describe("isPrivilegedChatUser", () => {
  it("reads the comma-separated env list, trimmed and case-insensitively", () => {
    process.env.CHATBOT_PRIVILEGED_EMAILS = " A@Example.com, b@example.com ,";
    expect(isPrivilegedChatUser("a@example.com")).toBe(true);
    expect(isPrivilegedChatUser("B@EXAMPLE.COM ")).toBe(true);
    expect(isPrivilegedChatUser("c@example.com")).toBe(false);
  });

  it("grants nobody for a missing, empty or whitespace email", () => {
    process.env.CHATBOT_PRIVILEGED_EMAILS = "a@example.com";
    expect(isPrivilegedChatUser(null)).toBe(false);
    expect(isPrivilegedChatUser(undefined)).toBe(false);
    expect(isPrivilegedChatUser("   ")).toBe(false);
  });

  it("does not grant an arbitrary address when the env is unset", () => {
    // The built-in default is one named person; anyone else stays read-only.
    delete process.env.CHATBOT_PRIVILEGED_EMAILS;
    expect(isPrivilegedChatUser("someone@example.com")).toBe(false);
  });

  it("does not treat an empty env list as 'everyone'", () => {
    process.env.CHATBOT_PRIVILEGED_EMAILS = " , ";
    expect(isPrivilegedChatUser("someone@example.com")).toBe(false);
  });
});
