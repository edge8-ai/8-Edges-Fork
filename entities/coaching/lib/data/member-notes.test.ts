import { describe, expect, it } from "vitest";
import { NOTE_MAX_LENGTH, validateNoteBody } from "./member-notes";

describe("validateNoteBody", () => {
  it("rejects an empty or whitespace-only note", () => {
    expect(validateNoteBody("")).toEqual({ ok: false, error: "Write the note first." });
    expect(validateNoteBody("   \n ")).toEqual({ ok: false, error: "Write the note first." });
  });

  it("accepts one character and the full thousand", () => {
    expect(validateNoteBody("x")).toEqual({ ok: true });
    expect(validateNoteBody("x".repeat(NOTE_MAX_LENGTH))).toEqual({ ok: true });
  });

  it("measures the trimmed body, so surrounding whitespace never fails a note", () => {
    expect(validateNoteBody(`  ${"x".repeat(NOTE_MAX_LENGTH)}  `)).toEqual({ ok: true });
  });

  it("rejects a note past the cap", () => {
    const res = validateNoteBody("x".repeat(NOTE_MAX_LENGTH + 1));
    expect(res.ok).toBe(false);
  });
});
