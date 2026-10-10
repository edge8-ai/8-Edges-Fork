// What a file deliverable may be (W.128), in one place the browser and the
// server both read: the drawer refuses a file the moment it is chosen, and the
// confirm action refuses the same file by the same rules once it is stored.
// The bucket enforces the cap and the allowlist as well
// (20261005140000_card_deliverables); these words are what a person reads.

import { formatBytes } from "@/kernel/ui/format";

export const DELIVERABLES_BUCKET = "card-attachments";

/** How long a thumbnail's signed address lasts: long enough to read the card. */
export const PREVIEW_SECONDS = 600;
/**
 * A video's: long enough to watch one through and still seek in it, since a
 * player asks for byte ranges with the same address for as long as it plays.
 */
export const VIDEO_SECONDS = 3600;

/** 500 MB, the bucket's own limit and the project's global one (Khoa, 5 Oct). */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

/** What the bucket accepts, and the short word a file row shows for each. */
export const FILE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "video/mp4": "MP4",
  "video/webm": "WEBM",
  "video/quicktime": "MOV",
  "application/pdf": "PDF",
  "text/plain": "TXT",
  "text/csv": "CSV",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/zip": "ZIP",
};

/**
 * The type each accepted extension stands for, when the browser gives none or
 * a name of its own. Every value is a key of FILE_TYPES.
 */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

/**
 * The file picker's `accept`: the types, and the extensions as well, because a
 * picker that does not know a type (HEIC on Windows) hides the files rather
 * than offering them (bug hunt B3).
 */
export const FILE_ACCEPT = [...Object.keys(FILE_TYPES), ...Object.keys(TYPE_BY_EXTENSION).map((ext) => `.${ext}`)].join(",");

/**
 * Other names browsers give the accepted types. Windows calls a zip
 * `application/x-zip-compressed`, older browsers say `image/pjpeg`, and so on;
 * the bucket knows only the standard name, so these are translated rather
 * than refused (bug hunt B3, 2026-10-05).
 */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  "application/x-zip-compressed": "application/zip",
  "application/x-zip": "application/zip",
  "multipart/x-zip": "application/zip",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
  "video/x-m4v": "video/mp4",
  "application/x-pdf": "application/pdf",
  "text/x-csv": "text/csv",
  "application/csv": "text/csv",
  "application/x-csv": "text/csv",
  "text/comma-separated-values": "text/csv",
};

/**
 * The type a file is held to: the browser's own when it is one the bucket
 * knows, its standard name when the browser used another, and the one its
 * extension stands for when the browser said nothing useful ("" for HEIC on
 * Windows, `application/octet-stream` for anything it does not recognise).
 *
 * A CSV on a machine with Excel arrives as `application/vnd.ms-excel`, so a
 * `.csv` is read as CSV whatever that says. A type the browser did name and
 * that is not on either list is kept as it is, so that an SVG called
 * "logo.png" is still refused for what it says it is.
 */
export function normaliseFileType(file: { name: string; type: string }): string {
  const ext = /\.([a-z0-9]+)$/.exec(file.name.toLowerCase())?.[1] ?? "";
  const type = file.type.trim().toLowerCase();
  if (ext === "csv" && (type === "application/vnd.ms-excel" || type === "")) return "text/csv";
  if (FILE_TYPES[type]) return type;
  if (TYPE_ALIASES[type]) return TYPE_ALIASES[type];
  if (type === "" || type === "application/octet-stream") return TYPE_BY_EXTENSION[ext] ?? type;
  return type;
}

/**
 * The same file carrying its normalised type, so everything downstream (the
 * refusal, the start action and the stored object's content type, which the
 * bucket checks) reads the one type. The bytes are not copied.
 */
export function withNormalisedType(file: File): File {
  const type = normaliseFileType(file);
  return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
}

export const isImageType = (type: string | null | undefined) => !!type && type.startsWith("image/");
export const isVideoType = (type: string | null | undefined) => !!type && type.startsWith("video/");

/**
 * The types that can run code when a browser opens them, named exactly. A
 * substring test (`/svg|html|xml/`) refused every modern Office file, whose
 * types all contain "openxmlformats" (bug hunt B1, 2026-10-05).
 */
const RUNS_CODE: ReadonlySet<string> = new Set(["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml"]);

export type FileRefusal ={ reason: "too-large" | "type"; title: string; detail: string };

/**
 * Why a file can't be attached, in the canvas's words, or null when it can.
 * SVG and HTML get their own reason: they can run code when opened, which is
 * the one refusal a person should understand rather than just accept.
 */
export function refuseFile(file: { name: string; size: number; type: string }): FileRefusal | null {
  if (file.size > MAX_FILE_BYTES) {
    return {
      reason: "too-large",
      title: `${file.name} is ${formatBytes(file.size)}`,
      detail: "The limit is 500 MB per file. Share it from Drive and add the link instead.",
    };
  }
  const lower = file.name.toLowerCase();
  // Held to the normalised type, so the browser, the start action and the
  // confirm action refuse the same file for the same reason.
  const type = normaliseFileType(file);
  if (RUNS_CODE.has(type) || /\.(svg|html?|xhtml|xml)$/.test(lower)) {
    return { reason: "type", title: `${file.name} can't be attached`, detail: "SVG and HTML files can run code when opened. Export a PNG instead." };
  }
  if (!FILE_TYPES[type]) {
    return {
      reason: "type",
      title: `${file.name} can't be attached`,
      detail: "Images, video, PDF, Office files and zip only. Zip it, or add a link instead.",
    };
  }
  return null;
}

/**
 * The object's path in the bucket: the card's folder, a random id, and the
 * name reduced to safe characters. The board is left out, because a card can
 * move between boards; the random id means two files of one name never meet.
 */
export function deliverablePath(taskId: string, filename: string, id: string): string {
  const base = filename.split(/[\\/]/).pop() || "file";
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
  return `task/${taskId}/${id}-${safe}`;
}

/**
 * Whether an image's first bytes are what its type claims. A thumbnail is
 * drawn inline, so a file that says PNG and is really SVG or HTML is refused
 * on confirm rather than trusted. Only images are checked: every other type is
 * served as a download and never rendered by the app.
 */
export function imageBytesMatch(type: string, head: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  switch (type) {
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
    case "image/heif":
      return ascii(4, "ftyp") && ["heic", "heix", "hevc", "heif", "mif1", "msf1"].some((brand) => ascii(8, brand));
    default:
      return !isImageType(type);
  }
}
