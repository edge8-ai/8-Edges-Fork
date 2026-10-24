import { describe, expect, it } from "vitest";
import { classifyInvoiceKind } from "./invoice-kind";

// The recurring/project vocabulary the QuickBooks sync applies to each invoice.
describe("classifyInvoiceKind", () => {
  it("reads a retainer or monthly line as recurring", () => {
    expect(classifyInvoiceKind([{ item_name: "Monthly retainer", description: "September" }])).toBe("recurring");
    expect(classifyInvoiceKind([{ item_name: "Staffing", description: "Dedicated engineer, Sep 2026" }])).toBe("recurring");
  });
  it("reads a sprint, workshop or retreat seat as project", () => {
    expect(classifyInvoiceKind([{ item_name: "Build sprint", description: "Phase 1" }])).toBe("project");
    expect(classifyInvoiceKind([{ item_name: "Retreat", description: "One seat, Saigon" }])).toBe("project");
  });
  it("lets the majority of lines decide, recurring on a tie", () => {
    expect(classifyInvoiceKind([{ item_name: "Retainer" }, { item_name: "Workshop" }])).toBe("recurring");
    expect(classifyInvoiceKind([{ item_name: "Retainer" }, { item_name: "Workshop" }, { item_name: "Sprint" }])).toBe("project");
  });
  it("returns null when nothing says either, and reads the memo too", () => {
    expect(classifyInvoiceKind([{ item_name: "Services", description: "" }])).toBeNull();
    expect(classifyInvoiceKind([], "Subscription renewal")).toBe("recurring");
    expect(classifyInvoiceKind(null)).toBeNull();
  });
});
