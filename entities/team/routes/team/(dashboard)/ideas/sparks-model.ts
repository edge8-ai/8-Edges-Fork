import type { SharedIdea } from "@/entities/team/lib/data";
import { IDEA_OFFICES, type IdeaOffice } from "@/entities/ideas/client";

// The shapes /team/ideas draws (ID.2): a spark's one-line hook, a star on the
// team sky, and the spark field's filter state. Pure functions of the rows the
// page already reads, so they are tested without a database or a browser.

export type SparkKind = "build" | "learning";

export const KIND_LABEL: Record<SparkKind, string> = {
  build: "We should build",
  learning: "I learned",
};

export function sparkKind(idea: Pick<SharedIdea, "kind">): SparkKind {
  return idea.kind === "learning" ? "learning" : "build";
}

const HOOK_MAX = 220;

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > HOOK_MAX ? `${one.slice(0, HOOK_MAX - 1).trimEnd()}…` : one;
}

// The line a reader sees before deciding to open a spark. Claude's write-up
// already leads with it: a learning's summary opens with one bold takeaway,
// a plan with a one-line pitch. Without a write-up, the person's own words.
export function sparkHook(idea: Pick<SharedIdea, "ai_plan" | "takeaway" | "story" | "problem">): string | null {
  const firstLine = idea.ai_plan
    ?.split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  if (firstLine) {
    const plain = firstLine.replace(/^[-*>\s]+/, "").replace(/\*\*|__|`/g, "").trim();
    if (plain) return clip(plain);
  }
  const own = idea.takeaway ?? idea.problem ?? idea.story;
  return own?.trim() ? clip(own) : null;
}

// The plan without its opening "One-line pitch" section when the page already
// shows that sentence (W.187): the hook under the title is taken from the same
// line, so the reader met it twice in one screen. Dropped only when the section
// leads the plan and its text is the hook (a clipped hook matches by its start);
// a pitch someone rewrote to say something else stays. Only the rendered plan
// loses it: the author edits the markdown as written.
const PITCH_HEADING = /^#{1,6}\s*one-line pitch\s*$/i;

export function planWithoutPitch(markdown: string, hook: string | null): string {
  if (!hook) return markdown;
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() !== "");
  if (start === -1 || !PITCH_HEADING.test(lines[start].trim())) return markdown;
  let end = start + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end].trim())) end++;
  const body = clip(lines.slice(start + 1, end).join(" ").replace(/^[-*>\s]+/, "").replace(/\*\*|__|`/g, ""));
  const lead = hook.endsWith("…") ? hook.slice(0, -1) : hook;
  if (!body || !body.startsWith(lead)) return markdown;
  return lines.slice(end).join("\n");
}

// A stable 0..1 from an id, so a star keeps its place in the sky between
// renders without storing a position anywhere.
export function unitHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Which of the nine avatar colour pairs (.sparks-avatar--0..8) a person wears,
// fixed by their id so the same face keeps the same colour everywhere.
export function avatarTone(personId: string): number {
  return Math.floor(unitHash(personId) * 9) % 9;
}

// Where a spark has got to, as the sky draws it (ID.2.12). Declared here, not
// imported from the ideas door, so this browser-safe module stays free of it;
// the page maps the entity's stage onto it one to one.
export type SkyStage = "spark" | "echoed" | "picked_up" | "shipped";

export type SkyStar = {
  id: string;
  title: string;
  kind: SparkKind;
  x: number;
  y: number;
  mine: boolean;
  stage: SkyStage;
  /** Shared in the last seven days: "New this week" lights it. */
  isNew: boolean;
  /** The viewer's own spark from the last few minutes: it arrives as a shooting star. */
  fresh: boolean;
};

// The team sky's frame, in SVG user units. Wide and short, so it reads as a
// band of sky rather than a chart; the floor is the strip the month marks sit in.
export const SKY = { w: 320, h: 170, pad: 10, floor: 24 } as const;

// How a star is drawn at each stage: a dot that grows as the spark goes
// further, and a four-point sparkle once it ships. Shared by the sky on
// /team/ideas and the band of it on the team Home (TH.1.5).
export const SKY_SPARKLE = "M0,-6 L1.4,-1.4 L6,0 L1.4,1.4 L0,6 L-1.4,1.4 L-6,0 L-1.4,-1.4 Z";
export const SKY_RADIUS: Record<SkyStage, number> = { spark: 2.2, echoed: 3, picked_up: 3, shipped: 0 };

const DAY_MS = 86_400_000;
const NEW_FOR_MS = 7 * DAY_MS;
const FRESH_FOR_MS = 3 * 60_000;

function skySpan(ideas: Pick<SharedIdea, "created_at">[], now: Date): { start: number; span: number } {
  const start = Math.min(...ideas.map((i) => new Date(i.created_at).getTime()));
  return { start, span: Math.max(now.getTime() - start, 1) };
}

function skyX(t: number, start: number, span: number): number {
  return Math.round((SKY.pad + ((t - start) / span) * (SKY.w - SKY.pad * 2)) * 10) / 10;
}

// One star per spark, left to right by date from the first spark to today.
export function skyStars(
  ideas: Pick<SharedIdea, "id" | "title" | "kind" | "created_at" | "person_id">[],
  now: Date,
  personId: string | null,
  stageOf: (id: string) => SkyStage = () => "spark",
): SkyStar[] {
  if (ideas.length === 0) return [];
  const { start, span } = skySpan(ideas, now);
  const innerH = SKY.h - SKY.floor - SKY.pad * 2;
  return ideas.map((i) => {
    const t = new Date(i.created_at).getTime();
    const mine = personId !== null && i.person_id === personId;
    return {
      id: i.id,
      title: i.title,
      kind: sparkKind(i),
      x: skyX(t, start, span),
      y: Math.round((SKY.pad + unitHash(i.id) * innerH) * 10) / 10,
      mine,
      stage: stageOf(i.id),
      isNew: now.getTime() - t < NEW_FOR_MS,
      fresh: mine && now.getTime() - t < FRESH_FOR_MS,
    };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type SkyTick = { label: string; x: number };

// A faint mark at the first of every month the sky spans, so its left-to-right
// reads as time. A month whose first day falls before the first spark is
// marked at the left edge, so the oldest month still has a name.
export function skyTicks(ideas: Pick<SharedIdea, "created_at">[], now: Date): SkyTick[] {
  if (ideas.length === 0) return [];
  const { start, span } = skySpan(ideas, now);
  const first = new Date(start);
  const ticks: SkyTick[] = [{ label: MONTHS[first.getUTCMonth()], x: skyX(start, start, span) }];
  for (let d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)); d.getTime() <= now.getTime(); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    ticks.push({ label: MONTHS[d.getUTCMonth()], x: skyX(d.getTime(), start, span) });
  }
  // Month marks are 12px on screen (W.191), about 14 of the sky's 320 units
  // each, so more than six would overlap: past that, every other month is named.
  return ticks.length > 6 ? ticks.filter((_, i) => i % 2 === 0) : ticks;
}

/** The viewer's own stars, oldest first (x is time), as SVG polyline points: their constellation. */
export function constellation(stars: SkyStar[]): string {
  return stars
    .filter((s) => s.mine)
    .sort((a, b) => a.x - b.x)
    .map((s) => `${s.x},${s.y}`)
    .join(" ");
}

export type FieldFilter = { kind: SparkKind | null; office: IdeaOffice | null; all: boolean };

export function readFieldFilter(params: { kind?: string; office?: string; all?: string }): FieldFilter {
  const kind = params.kind === "build" || params.kind === "learning" ? params.kind : null;
  const office = (IDEA_OFFICES as readonly string[]).includes(params.office ?? "") ? (params.office as IdeaOffice) : null;
  return { kind, office, all: params.all === "1" };
}

export function isFiltered(f: FieldFilter): boolean {
  return f.kind !== null || f.office !== null;
}

export function filterField<T extends Pick<SharedIdea, "kind" | "office">>(ideas: T[], f: FieldFilter): T[] {
  return ideas.filter((i) => (f.kind === null || sparkKind(i) === f.kind) && (f.office === null || i.office === f.office));
}

// The URL for one filter chip: the chip's own value replaces its group's, and
// choosing the value already chosen clears it. "Show all" never survives a
// filter change, so a narrowed field starts from the top again. No #fragment:
// a hash never lands on a streamed page, so the chips keep the scroll instead.
export function fieldHref(f: FieldFilter, change: Partial<Pick<FieldFilter, "kind" | "office">> & { all?: boolean }): string {
  const next = {
    kind: "kind" in change ? change.kind ?? null : f.kind,
    office: "office" in change ? change.office ?? null : f.office,
    all: change.all ?? false,
  };
  const q = new URLSearchParams();
  if (next.kind) q.set("kind", next.kind);
  if (next.office) q.set("office", next.office);
  if (next.all) q.set("all", "1");
  const s = q.toString();
  return s ? `/team/ideas?${s}` : "/team/ideas";
}

// How many tiles the field shows before "Show all".
export const FIELD_FIRST = 12;
