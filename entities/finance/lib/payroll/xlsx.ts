// A minimal .xlsx reader for the accountant's payroll workbooks: every sheet's
// name and its cell values, as the workbook last calculated them. An .xlsx is a
// zip of XML parts; this reads the three it needs (the workbook's sheet list,
// the shared strings and each sheet) with fflate, which has no dependencies,
// rather than a spreadsheet library that brings dozens.
//
// Formula cells hold their cached result in <v>, which is what the register's
// totals and net figures are, so nothing is recalculated. Dates arrive as their
// serial numbers; the payroll reader needs none.
import { strFromU8, unzipSync } from "fflate";

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? _;
  });
}

/** The text of every <t> inside a fragment, joined: a rich-text string is split across runs. */
function textOf(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? decode(m[1]) : "";
  return out;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

/** Column letters of a cell reference to a 0-based index: "A1" → 0, "AB7" → 27. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSheet(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = [];
  let width = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowNumber = Number(attr(rowMatch[1] ?? rowMatch[3] ?? "", "r"));
    const cells: Cell[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      const type = attr(c[1], "t");
      const body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: Cell = null;
      if (type === "s") value = v === undefined ? null : (shared[Number(v)] ?? null);
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str" || type === "e") value = v === undefined ? null : decode(v);
      else if (type === "b") value = v === "1";
      // A number longer than a double holds exactly (a bank account typed as
      // a number) stays as its digits, as openpyxl's integers do.
      else if (v !== undefined && v !== "") value = /^-?\d{16,}$/.test(v) ? v : Number(v);
      const col = ref ? columnIndex(ref) : cells.length;
      cells[col] = value === "" ? null : value;
    }
    width = Math.max(width, cells.length);
    rows[(Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber : rows.length + 1) - 1] = cells;
  }
  // Every row as wide as the widest, with gaps as null, as openpyxl hands them back.
  return Array.from(rows, (r) => Array.from({ length: width }, (_, i) => r?.[i] ?? null));
}

/** Every sheet of an .xlsx file, in workbook order. Throws when the bytes are not a workbook. */
export function readWorkbook(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.startsWith("xl/") });
  } catch {
    throw new Error("That file is not an Excel workbook (.xlsx).");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new Error("That file is not an Excel workbook (.xlsx).");

  const shared: string[] = [];
  for (const si of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(si[1]));

  const targets = new Map<string, string>();
  for (const rel of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attr(rel[0], "Id");
    const target = attr(rel[0], "Target");
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const s of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(s[0], "name") ?? "";
    const target = targets.get(attr(s[0], "r:id") ?? "");
    const xml = target ? text(`xl/${target}`) : null;
    sheets.push({ name, rows: xml ? readSheet(xml, shared) : [] });
  }
  return sheets;
}
