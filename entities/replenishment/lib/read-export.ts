import * as XLSX from "xlsx";
import type { Cell } from "./engine";

// An uploaded stock export, as the rows the engine reads: the first sheet,
// header first, raw values, blanks as null. It imports only SheetJS, so a port
// can copy it as it is.
//
// One client's inventory system writes workbooks whose styles part a styles
// parser rejects, although every cell is intact. Nothing here needs styles, so
// a workbook that will not open is opened again with its styles removed before
// the file is refused.

function firstSheet(book: XLSX.WorkBook): Cell[][] {
  const name = book.SheetNames[0];
  if (name === undefined) throw new Error("The file has no sheet.");
  return XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[name], { header: 1, raw: true, defval: null });
}

/** An empty stylesheet: the workbook still names a styles part, so it is replaced rather than removed. */
const NO_STYLES = '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>';

function withoutStyles(bytes: Uint8Array): Uint8Array {
  const zip = XLSX.CFB.read(bytes, { type: "array" });
  const styles = zip.FullPaths.find((path: string) => path.endsWith("xl/styles.xml"));
  if (styles === undefined) throw new Error("no styles part");
  XLSX.CFB.utils.cfb_del(zip, styles);
  XLSX.CFB.utils.cfb_add(zip, styles, new TextEncoder().encode(NO_STYLES));
  return new Uint8Array(XLSX.CFB.write(zip, { fileType: "zip", type: "array" }) as number[]);
}

/**
 * `raw: true` keeps CSV values as text: an item code such as 00123 must not
 * become the number 123. The engine reads quantities from text itself.
 */
export function readExport(bytes: Uint8Array): Cell[][] {
  const read = (data: Uint8Array) => firstSheet(XLSX.read(data, { type: "array", raw: true }));
  try {
    return read(bytes);
  } catch {
    try {
      return read(withoutStyles(bytes));
    } catch {
      throw new Error("The file could not be read as a spreadsheet. Export it again as .xlsx or .csv.");
    }
  }
}
