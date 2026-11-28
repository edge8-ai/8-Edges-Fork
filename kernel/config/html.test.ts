import { describe, expect, it } from "vitest";
import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("escapes all five HTML entities", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Nguyễn Thị Mai — Saigon")).toBe("Nguyễn Thị Mai — Saigon");
  });
  it("does not double-escape an already-escaped ampersand differently from any other &", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
  it("returns an empty string for null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
