import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkboardData } from "@/entities/boards/lib/workboard";
import type { Form } from "./board-view-types";
import { CardWhereRows } from "./CardWhereRows";

// W.168, Dave via Khoa 2026-10-06: the client is chosen first, then its brand,
// because sprints and epics belong to a brand. These pin what the drawer asks
// for, in which order, on a new card and on one that exists.

const data = {
  boards: [
    { id: "b-apa-os", name: "APA Company OS", slug: "apa-os", client_company_id: "apa", client_name: "Australian Payroll Association" },
    { id: "b-piq", name: "Payroll IQ", slug: "piq", client_company_id: "apa", client_name: "Australian Payroll Association" },
    { id: "b-gam", name: "GAM Entertainment", slug: "gam", client_company_id: "gam", client_name: "GAM Entertainment" },
    { id: "b-ops", name: "Operations", slug: "ops", client_company_id: null, client_name: null },
  ],
  clients: [
    { id: "apa", name: "Australian Payroll Association" },
    { id: "gam", name: "GAM Entertainment" },
  ],
} as unknown as WorkboardData;

const blank = { id: null, clientId: "", boardId: "", sprintId: "", epicId: "" } as unknown as Form;
const draw = (form: Partial<Form>, over: Partial<{ data: WorkboardData; readOnly: boolean }> = {}) =>
  renderToStaticMarkup(<CardWhereRows form={{ ...blank, ...form } as Form} setForm={() => {}} data={over.data ?? data} readOnly={over.readOnly ?? false} />);

describe("CardWhereRows (W.168)", () => {
  it("asks for the client first on a new card, and shuts the brand until it is chosen", () => {
    const out = draw({});
    expect(out.indexOf(">Client<")).toBeLessThan(out.indexOf(">Brand<"));
    expect(out).toContain("Choose a client…");
    expect(out).toContain("is-next");
    expect(out).toContain("Choose a client first");
    expect(out).toMatch(/<button type="button" class="wb-pill is-empty" disabled="">Choose a client first<\/button>/);
  });

  it("asks for the brand once a client with several is chosen", () => {
    const out = draw({ clientId: "apa" });
    expect(out).toContain("Australian Payroll Association");
    expect(out).toContain("Choose a brand…");
    expect(out).not.toContain("Choose a client first");
  });

  it("fills in the brand of a client that has one", () => {
    const out = draw({ clientId: "gam", boardId: "b-gam" });
    expect(out).toContain("GAM Entertainment");
    expect(out).toContain("Its only brand.");
    expect(out).not.toContain("Choose a brand…");
  });

  it("names the client and brand of an existing card, read-only", () => {
    const out = draw({ id: "t1", clientId: "apa", boardId: "b-piq" } as unknown as Partial<Form>);
    expect(out).toContain('<span class="wb-core-value wb-where-fixed">Australian Payroll Association</span>');
    expect(out).toContain('<span class="wb-core-value wb-where-fixed">Payroll IQ</span>');
    expect(out).not.toContain("<button");
  });

  it("calls a board with no client Internal", () => {
    expect(draw({ id: "t2", boardId: "b-ops" } as unknown as Partial<Form>)).toContain(">Internal<");
  });

  it("draws nothing on a single board's page, where there is nothing to choose", () => {
    const one = { ...data, boards: [data.boards[1]] } as unknown as WorkboardData;
    expect(draw({ boardId: "b-piq" }, { data: one })).toBe("");
  });
});
