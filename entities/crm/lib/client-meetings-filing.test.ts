import { describe, expect, it } from "vitest";
import { CLIENT_MEETING_SLICE_CLASS, clientsInTitle, isSprintPlanning, titleWords } from "./client-meetings-filing";

// client-meetings-filing: which Lark calls become which client's meeting.

const clients = [
  { name: "Acme Pty Ltd" },
  { name: "Northwind Solutions" },
  { name: "Pacific Freight Association" },
  { name: "Exporters Organization" },
  { name: "Harbour Team" },
];

describe("titleWords", () => {
  it("takes the first real word and the acronym", () => {
    expect(titleWords("Acme Pty Ltd")).toEqual(["acme", "apl"]);
    expect(titleWords("Pacific Freight Association")).toEqual(["pacific", "pfa"]);
  });
});

describe("clientsInTitle", () => {
  it("finds the client a direct call names", () => {
    expect(clientsInTitle("Weekly Acme <> Edge8 Sync", clients).map((c) => c.name)).toEqual(["Acme Pty Ltd"]);
    expect(clientsInTitle("11-19 | Northwind <> Edge 8 Sync", clients).map((c) => c.name)).toEqual(["Northwind Solutions"]);
    expect(clientsInTitle("EO - Weekly Sprint Review/Planning", clients).map((c) => c.name)).toEqual(["Exporters Organization"]);
  });

  it("does not match an acronym inside another word", () => {
    expect(clientsInTitle("Onboarding - Company Overview", clients)).toEqual([]);
    expect(clientsInTitle("1-1 Khoa <> Dave", clients)).toEqual([]);
  });
});

describe("isSprintPlanning", () => {
  it("is Edge8's internal weekly call only", () => {
    expect(isSprintPlanning("Weekly Sprint Planning")).toBe(true);
    expect(isSprintPlanning("EO - Weekly Sprint Review/Planning")).toBe(false);
  });
});

describe("the slice's class", () => {
  it("is C, client transcripts", () => {
    expect(CLIENT_MEETING_SLICE_CLASS).toBe("C");
  });
});
