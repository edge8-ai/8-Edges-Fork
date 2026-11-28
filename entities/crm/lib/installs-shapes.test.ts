import { describe, expect, it } from "vitest";
import { RecordInstallInput, UpdateInstallInput } from "./installs-shapes";

// The form's rules match the table's check constraints, so a bad entry is
// refused with a sentence before it reaches the database.
const base = {
  contactName: "Jo Smith",
  email: " Jo@Acme.example ",
  companyName: "Acme",
  downloadedOn: "2026-11-16",
  source: "website",
  status: "downloaded",
} as const;

describe("recording an Eight Edges install", () => {
  it("takes a download with only the five required fields", () => {
    const r = RecordInstallInput.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ email: "jo@acme.example", installedOn: null, evidenceUrl: null, notes: null });
  });

  it("refuses an install with no install date", () => {
    const r = RecordInstallInput.safeParse({ ...base, status: "installed" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe("An install needs the day it first ran.");
  });

  it("refuses an install dated before its download", () => {
    const r = RecordInstallInput.safeParse({ ...base, status: "installed", installedOn: "2026-11-01" });
    expect(r.success).toBe(false);
  });

  it("refuses a link that is not http or https", () => {
    expect(RecordInstallInput.safeParse({ ...base, evidenceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(RecordInstallInput.safeParse({ ...base, evidenceUrl: "https://acme.example" }).success).toBe(true);
  });

  it("refuses a source the table does not allow", () => {
    expect(RecordInstallInput.safeParse({ ...base, source: "tiktok" }).success).toBe(false);
  });

  it("moves a download to installed with its date", () => {
    const r = UpdateInstallInput.safeParse({
      id: "6014551c-4868-40be-9bf5-5432d7e82ef1",
      status: "installed",
      downloadedOn: "2026-11-16",
      installedOn: "2026-11-20",
      evidenceUrl: "",
    });
    expect(r.success && r.data).toMatchObject({ installedOn: "2026-11-20", evidenceUrl: null });
  });
});
