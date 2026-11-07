import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { readExport } from "./read-export";

const SHEET = [
  ["Item", "Description", "Bin", "On hand"],
  ["K-1", "Kestrel Arlo 39R", "U01-01", 30],
  ["K-1", "Kestrel Arlo 39R", null, 2.5],
];

function workbook(...sheets: unknown[][][]): Uint8Array {
  const book = XLSX.utils.book_new();
  sheets.forEach((rows, i) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), `Sheet${i + 1}`));
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** The same workbook with its styles part replaced, as some inventory systems write it. */
function withStyles(bytes: Uint8Array, styles: string): Uint8Array {
  const zip = XLSX.CFB.read(bytes, { type: "array" });
  const path = zip.FullPaths.find((p: string) => p.endsWith("xl/styles.xml"));
  if (!path) throw new Error("fixture has no styles part");
  XLSX.CFB.utils.cfb_del(zip, path);
  XLSX.CFB.utils.cfb_add(zip, path, new TextEncoder().encode(styles));
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array" }) as number[]);
}

describe("readExport", () => {
  it("reads the first sheet as raw values, header first, blanks as null", () => {
    expect(readExport(workbook(SHEET, [["Other"], ["ignored"]]))).toEqual(SHEET);
  });

  it("reads a CSV export as text, so an item code keeps its leading zeros", () => {
    const csv = new TextEncoder().encode("Item,Description,Bin,On hand\n00123,Kestrel Arlo 39R,U01-01,30\n");
    expect(readExport(csv)).toEqual([["Item", "Description", "Bin", "On hand"], ["00123", "Kestrel Arlo 39R", "U01-01", "30"]]);
  });

  // Exports have been seen with conditional-formatting fills a styles parser
  // rejects; nothing here needs styles, so they must never block a read.
  it("reads a workbook whose style definitions make the spreadsheet library itself throw", () => {
    // A number format with no format code: SheetJS throws on this on its own,
    // so the test proves the read-again-without-styles path.
    const odd = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164"/></numFmts><cellXfs count="1"><xf numFmtId="abc" fontId="x"/></cellXfs></styleSheet>`;
    const bytes = withStyles(workbook(SHEET), odd);
    expect(() => XLSX.read(bytes, { type: "array" })).toThrow();
    expect(readExport(bytes)).toEqual(SHEET);
  });

  it("reads a workbook whose styles part is not even well-formed", () => {
    expect(readExport(withStyles(workbook(SHEET), "<styleSheet><fills><fill><patternFill"))).toEqual(SHEET);
  });

  it("refuses a file that is not a readable spreadsheet, saying so", () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => readExport(broken)).toThrow(/could not be read/);
  });
});
