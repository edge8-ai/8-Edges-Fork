import { describe, it, expect } from "vitest";
import { csvCell, csvFilename, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves a plain value alone", () => {
    expect(csvCell("Contoso")).toBe("Contoso");
    expect(csvCell(1234)).toBe("1234");
    expect(csvCell(true)).toBe("true");
  });

  it("renders null and undefined as an empty cell, not as the word", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes a comma, a newline and a carriage return", () => {
    expect(csvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("doubles an embedded quote and wraps the field", () => {
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
  });

  it("leaves a negative NUMBER alone, so a margin column still sums in a spreadsheet", () => {
    // Defusing this would quote it as text and the column would total short by
    // exactly the unmapped-cost and negative-margin rows.
    expect(csvCell(-1234)).toBe("-1234");
    expect(csvCell(-0.5)).toBe("-0.5");
    expect(csvCell(0)).toBe("0");
  });

  it("renders a non-finite number as an empty cell rather than the word NaN", () => {
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(Infinity)).toBe("");
  });

  it("defuses a leading formula character so a name is never evaluated", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe('"\t=SUM(A1:A9)"');
    expect(csvCell("-Northwind")).toBe('"\t-Northwind"');
    expect(csvCell("@handle")).toBe('"\t@handle"');
  });
});

describe("toCsv", () => {
  it("returns nothing for no rows, so an empty card offers no file", () => {
    expect(toCsv([])).toBe("");
  });

  it("writes a header from the first row's key order, then the rows", () => {
    const csv = toCsv([
      { client: "Contoso", billed: 319_000 },
      { client: "Initech", billed: 148_000 },
    ]);
    expect(csv.split("\r\n")).toEqual(["client,billed", "Contoso,319000", "Initech,148000"]);
  });

  it("keeps columns aligned when a later row has a missing or extra key", () => {
    const csv = toCsv([
      { a: 1, b: 2 },
      { a: 3 } as Record<string, number>,
      { a: 4, b: 5, c: 6 } as Record<string, number>,
    ]);
    expect(csv.split("\r\n")).toEqual(["a,b", "1,2", "3,", "4,5"]);
  });

  it("round-trips a value holding a comma, a quote and a newline", () => {
    const value = 'Acme, "the" firm\nsecond line';
    const csv = toCsv([{ name: value }]);
    const body = csv.split("\r\n").slice(1).join("\r\n");
    expect(body.slice(1, -1).replace(/""/g, '"')).toBe(value);
  });
});

describe("csvFilename", () => {
  it("slugs the name and dates the file", () => {
    expect(csvFilename("Revenue by client", new Date("2026-09-14T10:00:00Z"))).toBe("revenue-by-client-2026-09-14.csv");
  });

  it("survives a name with nothing sluggable in it", () => {
    expect(csvFilename("···", new Date("2026-09-14T10:00:00Z"))).toBe("rows-2026-09-14.csv");
  });
});
