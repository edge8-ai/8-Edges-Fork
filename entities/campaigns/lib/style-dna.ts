// A brand's Style DNA (MS21), stored as markdown in brand_profiles.image_style_md
// so no migration was needed (R3.343). Every visual decision is either Fixed
// (every image, every channel) or Variable by channel, one `## ` section each:
//
//   <!-- style-dna: draft -->
//   ## Fixed
//   - Palette: ...
//   ## LinkedIn
//   - Composition: ...
//
// The marker line means a person has not approved the draft yet; it is a flag
// for the editor, never guidance, so no model ever sees it. Text with no `## `
// heading at all is the free text every brand had before Style DNA; it reads
// as the whole Fixed guidance, unchanged, so nothing breaks before anyone edits.
//
// The parser keeps every line it does not understand, because a person edits
// this field by hand and a save through the Style DNA editor must not drop
// what they typed. The org entity's parseSections trims bodies and drops lines
// above the first heading, so it cannot round-trip and is not reused here.
//
// Pure functions only: the Style DNA editor imports this module in the browser.

export const STYLE_DNA_DRAFT_MARKER = "<!-- style-dna: draft -->";

export const STYLE_DNA_FIXED_HEADING = "Fixed";

// The channels a Style DNA has a section for, in the order the editor shows
// them. The calendar's `twitter` channel is headed `## X`, the platform's
// current name, because that heading is what a person reads and writes.
export const STYLE_DNA_CHANNELS = [
  { channel: "linkedin", heading: "LinkedIn" },
  { channel: "facebook", heading: "Facebook" },
  { channel: "twitter", heading: "X" },
] as const;

export type StyleDnaChannel = (typeof STYLE_DNA_CHANNELS)[number]["channel"];

// The field labels the editor offers, in order, written as `- Label: value`.
export const STYLE_DNA_FIXED_LABELS = ["Palette", "Type", "Wordmark", "Mood", "Quality", "People", "Words", "House style"] as const;
export const STYLE_DNA_CHANNEL_LABELS = ["Composition", "Environment", "Energy", "Camera angle"] as const;

export type StyleDnaSection = { heading: string; lines: string[] };

export type StyleDna = {
  draft: boolean;
  // Lines above the first heading, the marker excluded. In legacy text (no
  // heading at all) this is the whole guidance.
  preamble: string[];
  sections: StyleDnaSection[];
};

const HEADING = /^##\s+(.+?)\s*$/;

function isMarker(line: string): boolean {
  return line.trim() === STYLE_DNA_DRAFT_MARKER;
}

export function parseStyleDna(md: string | null): StyleDna {
  const dna: StyleDna = { draft: false, preamble: [], sections: [] };
  if (!md) return dna;
  let current: StyleDnaSection | null = null;
  for (const line of md.split("\n")) {
    if (isMarker(line)) {
      dna.draft = true;
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      current = { heading: h[1], lines: [] };
      dna.sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      dna.preamble.push(line);
    }
  }
  return dna;
}

// The marker is written first, where the format puts it, whichever line it
// was read from.
export function serializeStyleDna(dna: StyleDna): string {
  const lines = dna.draft ? [STYLE_DNA_DRAFT_MARKER] : [];
  lines.push(...dna.preamble);
  for (const s of dna.sections) lines.push(`## ${s.heading}`, ...s.lines);
  return lines.join("\n");
}

export function isLegacyStyleDna(dna: StyleDna): boolean {
  return dna.sections.length === 0;
}

export function isStyleDnaDraft(md: string | null): boolean {
  return parseStyleDna(md).draft;
}

// Marks a drafted Style DNA, or approves one by clearing the marker. Every
// other line is kept as it was.
export function setStyleDnaDraft(md: string | null, draft: boolean): string {
  return serializeStyleDna({ ...parseStyleDna(md), draft });
}

export function styleDnaHeadingFor(channel: string | null): string | null {
  return STYLE_DNA_CHANNELS.find((c) => c.channel === channel)?.heading ?? null;
}

function sameHeading(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nonEmpty(text: string): string | null {
  return text.trim() ? text.trim() : null;
}

// The whole Style DNA as text, without the draft marker: for a reader that
// works across every channel at once, such as the writer drafting each
// channel's image brief.
export function styleDnaText(md: string | null): string | null {
  return nonEmpty(serializeStyleDna({ ...parseStyleDna(md), draft: false }));
}

// The guidance one channel's image is made from: the Fixed section (and any
// text above it) plus that channel's own section, and nothing from another
// channel, so a Facebook image is never composed by LinkedIn's rules. A
// channel without a section of its own (email, the blog) gets the Fixed
// guidance alone. Legacy text is returned exactly as stored, so a brand nobody
// has moved to Style DNA yet gets the same image prompt it got before.
export function styleDnaGuidanceFor(md: string | null, channel: string | null): string | null {
  const dna = parseStyleDna(md);
  if (isLegacyStyleDna(dna)) return dna.draft ? nonEmpty(dna.preamble.join("\n")) : md?.trim() ? md : null;
  const heading = styleDnaHeadingFor(channel);
  const keep = (s: StyleDnaSection) => sameHeading(s.heading, STYLE_DNA_FIXED_HEADING) || (heading !== null && sameHeading(s.heading, heading));
  return nonEmpty(serializeStyleDna({ draft: false, preamble: dna.preamble, sections: dna.sections.filter(keep) }));
}

// The same guidance as styleDnaGuidanceFor, split the way a person reads it:
// the Fixed lines (with any text above the sections, which every channel
// reads) and the channel's own lines. Legacy text is one guidance rather than
// a list of decisions, so it comes back whole, exactly as the prompt gets it.
export type StyleDnaDecisions =
  | { legacy: true; text: string | null }
  | { legacy: false; fixed: string[]; channel: string[] };

export function styleDnaDecisionsFor(md: string | null, channel: string | null): StyleDnaDecisions {
  const dna = parseStyleDna(md);
  if (isLegacyStyleDna(dna)) return { legacy: true, text: styleDnaGuidanceFor(md, channel) };
  const heading = styleDnaHeadingFor(channel);
  const linesUnder = (h: string) => dna.sections.filter((s) => sameHeading(s.heading, h)).flatMap((s) => s.lines);
  return {
    legacy: false,
    fixed: [...dna.preamble, ...linesUnder(STYLE_DNA_FIXED_HEADING)],
    channel: heading ? linesUnder(heading) : [],
  };
}

type StyleDnaFixedLabel = (typeof STYLE_DNA_FIXED_LABELS)[number];
type StyleDnaChannelLabel = (typeof STYLE_DNA_CHANNEL_LABELS)[number];

// What the Style DNA card edits: one string per labelled field ("" is unset),
// and the free text that is no field at all. In legacy text the free text is
// the whole guidance; once sections exist it is whatever sits above them.
export type StyleDnaForm = {
  draft: boolean;
  freeText: string;
  fixed: Record<StyleDnaFixedLabel, string>;
  channels: Record<StyleDnaChannel, Record<StyleDnaChannelLabel, string>>;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldLine(label: string): RegExp {
  return new RegExp(`^\\s*-\\s*${escapeRegExp(label)}\\s*:`, "i");
}

// Any `- Label: value` line, known label or not. A new field goes after the
// last of these, so it lands among the fields rather than below a person's
// own notes at the end of the section.
const ANY_FIELD = /^\s*-\s*[^:]+:/;

function readField(lines: string[], label: string): string {
  const line = lines.find((l) => fieldLine(label).test(l));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}

// A field is one line in the format, so a value typed across several lines is
// joined with spaces rather than spilling into stray lines that a reader would
// not tie to its label.
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Sets one field's line in place, adds it after the last field when absent,
// and removes it when cleared. Every other line is left as it was.
function writeField(lines: string[], label: string, value: string): string[] {
  const text = oneLine(value);
  const at = lines.findIndex((l) => fieldLine(label).test(l));
  if (at >= 0) {
    return text ? lines.map((l, i) => (i === at ? `- ${label}: ${text}` : l)) : lines.filter((_, i) => i !== at);
  }
  if (!text) return lines;
  let last = -1;
  lines.forEach((l, i) => {
    if (ANY_FIELD.test(l)) last = i;
  });
  return [...lines.slice(0, last + 1), `- ${label}: ${text}`, ...lines.slice(last + 1)];
}

function sectionLines(dna: StyleDna, heading: string): string[] {
  return dna.sections.find((s) => sameHeading(s.heading, heading))?.lines ?? [];
}

function fieldsOf<L extends string>(labels: readonly L[], lines: string[]): Record<L, string> {
  return Object.fromEntries(labels.map((label) => [label, readField(lines, label)])) as Record<L, string>;
}

export function styleDnaForm(md: string | null): StyleDnaForm {
  const dna = parseStyleDna(md);
  return {
    draft: dna.draft,
    freeText: dna.preamble.join("\n").trim(),
    fixed: fieldsOf(STYLE_DNA_FIXED_LABELS, sectionLines(dna, STYLE_DNA_FIXED_HEADING)),
    channels: Object.fromEntries(
      STYLE_DNA_CHANNELS.map((c) => [c.channel, fieldsOf(STYLE_DNA_CHANNEL_LABELS, sectionLines(dna, c.heading))]),
    ) as StyleDnaForm["channels"],
  };
}

function endsBlank(lines: string[]): boolean {
  return lines.length > 0 && lines[lines.length - 1].trim() === "";
}

// The markdown the card saves: `md` (the stored text) with the form's fields
// written over it. Unknown labels, stray lines and sections the card does not
// show are kept, and a section is added only once one of its fields is set, so
// legacy text saved with no field filled stays exactly as it was. The free
// text stays above the sections, where every channel's guidance reads it.
export function styleDnaFromForm(form: StyleDnaForm, md: string | null): string {
  const stored = parseStyleDna(md);
  const sections = stored.sections.map((s) => ({ heading: s.heading, lines: [...s.lines] }));

  const apply = (heading: string, values: Record<string, string>, first: boolean) => {
    const existing = sections.find((s) => sameHeading(s.heading, heading));
    const lines = Object.entries(values).reduce((acc, [label, value]) => writeField(acc, label, value), existing?.lines ?? []);
    if (existing) {
      existing.lines = lines;
      return;
    }
    if (lines.length === 0) return;
    if (first) {
      sections.unshift({ heading, lines: sections.length > 0 ? [...lines, ""] : lines });
      return;
    }
    const previous = sections[sections.length - 1];
    if (previous && !endsBlank(previous.lines)) previous.lines.push("");
    sections.push({ heading, lines });
  };
  apply(STYLE_DNA_FIXED_HEADING, form.fixed, true);
  for (const c of STYLE_DNA_CHANNELS) apply(c.heading, form.channels[c.channel], false);

  // An unchanged free text keeps its stored lines, blank ones included, so a
  // save that only touched a field does not reflow it.
  const freeText = form.freeText.trim();
  const preamble = freeText === stored.preamble.join("\n").trim() ? [...stored.preamble] : freeText ? freeText.split("\n") : [];
  if (sections.length > 0 && preamble.length > 0 && !endsBlank(preamble)) preamble.push("");

  return serializeStyleDna({ draft: form.draft, preamble, sections });
}

type StyleDnaColour = { name: string; role: string; hex: string };

const PALETTE_ITEM = /^(.*?)\s*(#[0-9a-f]{6}|#[0-9a-f]{3})(?![0-9a-f])\s*(.*)$/i;

// The swatches the card draws, read from the Palette line: comma-separated
// items, each a colour's name, its hex code and its role, as the format writes
// them. An item with no hex has nothing to draw and is left out; the line
// itself is kept as typed.
export function styleDnaPalette(line: string): StyleDnaColour[] {
  const colours: StyleDnaColour[] = [];
  for (const item of line.split(/[,;]/)) {
    const m = item.trim().match(PALETTE_ITEM);
    if (!m) continue;
    const hex = m[2].toUpperCase();
    const role = m[3].replace(/[.\s]+$/, "");
    colours.push({ name: m[1].trim() || hex, role: role.charAt(0).toUpperCase() + role.slice(1), hex });
  }
  return colours;
}
