// The programme read's rules (TR.7, training tracking spec, "The programme
// read"): from the register and the reviews in a viewer's scope, the figures
// for each slice (a training type or a plan, over a period), and which slices
// may be shown at all. Pure, so every rule is proved without a database, and
// both pages ask this one function, so neither can forget a rule.
//
// Three rules keep a review honest (ADR 0016):
// 1. A slice fewer than three people reviewed comes back hidden, with the
//    reason, and no figure at all: not its attendance either.
// 2. A filter that would narrow the read below three reviewers is refused,
//    not shown as empty, so "nobody reviewed" and "too few to show" never look
//    alike.
// 3. A slice that would let a reader subtract their way to fewer than three
//    people is hidden too. Class shown beside one of its plans gives away
//    Class without that plan, and the last thirty days beside since-the-start
//    gives away the older reviews. Whether a slice is shown is decided once,
//    over every period and every slice in the viewer's scope, before any
//    filter, so no filter can show what another view would subtract.
import { FEELING_LABEL, SKIP_REASON_LABEL, type Feeling, type Load, type SkipReason } from "./training-rules";

/** The fewest distinct people a figure may stand for. */
export const MIN_PEOPLE = 3;

export const PERIODS = ["start", "q", "m"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { start: "Since the start", q: "Last 3 months", m: "Last 30 days" };
const PERIOD_DAYS: Record<Period, number | null> = { start: null, q: 91, m: 30 };

/** One person on one training that has started, with their word and their review. */
export type Fact = {
  trainingId: string;
  startsAt: string;
  typeId: string;
  planId: string | null;
  personId: string;
  status: "pending" | "attended" | "skipped" | "absent";
  skipReason: SkipReason | null;
  review: { stars: number; load: Load | null; tags: Feeling[]; note: string | null; signed: boolean } | null;
};

export type SliceRef = { grain: "type" | "plan"; id: string; name: string; sub: string };

export type Figures = {
  trainings: number;
  reviewers: number;
  reviews: number;
  stars: number;
  load: Record<Load, number>;
  tags: { label: string; n: number }[];
  listed: number;
  went: number;
  skipped: number;
  absent: number;
  noAnswer: number;
  skips: { label: string; n: number }[];
  namelessNotes: number;
  signedNotes: number;
};

export type HiddenReason = "few" | "beside";
/** A review's note in a shown slice. The person stays server-side: the page resolves only a signed note's name (leavers.ts). */
export type SliceNote = { text: string; personId: string; signed: boolean };

export type Slice = SliceRef & ({ shown: true; figures: Figures; notes: SliceNote[] } | { shown: false; reason: HiddenReason; beside: string | null });

/**
 * Pure: the notes of a shown slice, in the order of their words. Not by date,
 * so a nameless note cannot be matched to the one training its writer went to.
 */
export function notesOf(facts: readonly Fact[]): SliceNote[] {
  return facts
    .flatMap((f) => (f.review?.note && f.review.note.trim() !== "" ? [{ text: f.review.note.trim(), personId: f.personId, signed: f.review.signed }] : []))
    .sort((a, b) => a.text.localeCompare(b.text));
}

export type ProgrammeRead =
  | { refused: true }
  | { refused: false; slices: Slice[]; totals: { reviews: number; stars: number; went: number; listed: number } | null };

/** Who is asking: their person, the plans they are on (open to them), and their access, for the programme atom's reach. */
export type ProgrammeViewer = { personId: string; planIds: ReadonlySet<string>; may: (permission: string, target?: { person?: string }) => boolean };

/**
 * Pure: whether a training is in the viewer's programme read. An organiser
 * always reads what they organised (a member's own logged training is not
 * organising), and a member reads the plans they are on. Beyond that, the
 * programme atom's reach decides: a manager's reaches their reports and
 * coachees (access.ts), Admin's every person. The Training organiser role does
 * not hold the atom, so a teacher reads only their own. A training is read
 * whole once any one of its people is in reach. One scope serves every page a
 * person opens, so nobody holds two different reads of the same plan.
 */
export function inScope(training: { organiserId: string; selfLogged: boolean; planId: string | null }, people: readonly string[], viewer: ProgrammeViewer): boolean {
  if (!training.selfLogged && training.organiserId === viewer.personId) return true;
  if (training.planId !== null && viewer.planIds.has(training.planId)) return true;
  return people.some((person) => viewer.may("training.programme", { person }));
}

/** Pure: whether a training that started at `startsAt` falls in the period. */
export function inPeriod(startsAt: string, period: Period, now: Date): boolean {
  const days = PERIOD_DAYS[period];
  return days === null || new Date(startsAt).getTime() >= now.getTime() - days * 86_400_000;
}

const people = (facts: readonly Fact[]) => new Set(facts.map((f) => f.personId)).size;
const reviewers = (facts: readonly Fact[]) => new Set(facts.filter((f) => f.review).map((f) => f.personId)).size;

/**
 * Pure: whether a group of facts may be stood for by a figure. An empty group
 * gives nothing away; otherwise it needs three reviewers, and three people on
 * the register, because a skip reason is someone's word too.
 */
function safe(facts: readonly Fact[]): boolean {
  if (facts.length === 0) return true;
  const r = reviewers(facts);
  return (r === 0 || r >= MIN_PEOPLE) && people(facts) >= MIN_PEOPLE;
}

/** Pure: a slice's own rule 1: three reviewers. */
function bigEnough(facts: readonly Fact[]): boolean {
  return reviewers(facts) >= MIN_PEOPLE;
}

const keyOf = (f: Fact) => `${f.trainingId}|${f.personId}`;

/** Pure: the figures for a group of facts. Callers show them only for a shown slice. */
export function figuresOf(facts: readonly Fact[]): Figures {
  const reviewed = facts.flatMap((f) => (f.review ? [f.review] : []));
  const load: Record<Load, number> = { too_little: 0, about_right: 0, too_much: 0 };
  const tags = new Map<Feeling, number>();
  for (const r of reviewed) {
    if (r.load) load[r.load] += 1;
    for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const skips = new Map<string, number>();
  for (const f of facts) {
    if (f.status !== "skipped") continue;
    const label = f.skipReason ? SKIP_REASON_LABEL[f.skipReason] : "No reason given";
    skips.set(label, (skips.get(label) ?? 0) + 1);
  }
  const byCount = (a: { label: string; n: number }, b: { label: string; n: number }) => b.n - a.n || a.label.localeCompare(b.label);
  const withNote = reviewed.filter((r) => r.note !== null && r.note.trim() !== "");
  return {
    trainings: new Set(facts.map((f) => f.trainingId)).size,
    reviewers: reviewers(facts),
    reviews: reviewed.length,
    stars: reviewed.length === 0 ? 0 : reviewed.reduce((s, r) => s + r.stars, 0) / reviewed.length,
    load,
    tags: [...tags].map(([t, n]) => ({ label: FEELING_LABEL[t], n })).sort(byCount),
    listed: facts.length,
    went: facts.filter((f) => f.status === "attended").length,
    skipped: facts.filter((f) => f.status === "skipped").length,
    absent: facts.filter((f) => f.status === "absent").length,
    noAnswer: facts.filter((f) => f.status === "pending").length,
    skips: [...skips].map(([label, n]) => ({ label, n })).sort(byCount),
    namelessNotes: withNote.filter((r) => !r.signed).length,
    signedNotes: withNote.filter((r) => r.signed).length,
  };
}

type Candidate = SliceRef & { period: Period; facts: Fact[]; shown: boolean; reason: HiddenReason | null; beside: string | null };

/**
 * Pure: which slices are shown, over every period at once (rule 3). Starts from
 * every slice three people reviewed. Then it splits the facts into cells: each
 * fact's cell is the set of shown slices it falls in. Adding and subtracting
 * shown slices can only ever isolate a union of whole cells, so the read is
 * safe once every cell is: three people, and no reviews or three reviewers.
 * Checking pairs is not enough; a type since the start, less the same type
 * over three months, less a plan from before that, isolates a cell no pair
 * shows (the boundary review on PR 2472). While a cell is too small, the
 * smallest slice that touches it is hidden, which merges it into a larger
 * cell. Each pass hides one slice, so it ends.
 */
function decide(candidates: Candidate[]): void {
  for (const c of candidates) {
    c.shown = bigEnough(c.facts);
    c.reason = c.shown ? null : "few";
  }
  for (;;) {
    const shown = candidates.filter((c) => c.shown);
    const hide = firstLeak(shown);
    if (!hide) return;
    hide.slice.shown = false;
    hide.slice.reason = "beside";
    hide.slice.beside = hide.beside;
  }
}

/** Pure: the facts grouped by the set of shown slices each falls in. Facts in no shown slice are not a cell: nothing shows them. */
function cellsOf(shown: Candidate[]): { members: Candidate[]; facts: Fact[] }[] {
  const by = new Map<string, { members: Candidate[]; facts: Fact[] }>();
  const seen = new Map<string, Fact>();
  const inSlices = new Map<string, Candidate[]>();
  for (const c of shown) {
    for (const f of c.facts) {
      const k = keyOf(f);
      seen.set(k, f);
      inSlices.set(k, [...(inSlices.get(k) ?? []), c]);
    }
  }
  for (const [k, members] of inSlices) {
    const id = members.map((c) => shown.indexOf(c)).join(",");
    const cell = by.get(id) ?? { members, facts: [] };
    cell.facts.push(seen.get(k)!);
    by.set(id, cell);
  }
  return [...by.values()];
}

/** The smaller of two slices, by facts, then plan before type, then the narrower period. */
function smaller(a: Candidate, b: Candidate): Candidate {
  if (a.facts.length !== b.facts.length) return a.facts.length < b.facts.length ? a : b;
  if (a.grain !== b.grain) return a.grain === "plan" ? a : b;
  return PERIODS.indexOf(a.period) >= PERIODS.indexOf(b.period) ? a : b;
}

function firstLeak(shown: Candidate[]): { slice: Candidate; beside: string } | null {
  for (const cell of cellsOf(shown)) {
    if (safe(cell.facts)) continue;
    // The slices that touch the cell: those it lies in, and those that cut it
    // out of them by sharing some of their facts without containing it.
    const keys = new Set(cell.facts.map(keyOf));
    const inner = new Set(cell.members.flatMap((c) => c.facts.map(keyOf)));
    const cutters = shown.filter((c) => !cell.members.includes(c) && c.facts.some((f) => inner.has(keyOf(f)) && !keys.has(keyOf(f))));
    const touching = [...cell.members, ...cutters];
    const s = touching.reduce(smaller);
    const others = touching.filter((c) => c !== s);
    if (others.length === 0) {
      // A cell only one slice touches is that whole slice, which rule 1 already passed.
      continue;
    }
    const other = others.reduce((x, c) => (c.facts.length > x.facts.length ? c : x));
    return { slice: s, beside: other.period === s.period ? other.name : PERIOD_LABEL[other.period].toLowerCase() };
  }
  return null;
}

export type ReadInput = {
  facts: readonly Fact[];
  types: readonly { id: string; name: string }[];
  plans: readonly { id: string; title: string }[];
  now: Date;
};
export type ReadFilter = { period: Period; typeId: string | null; planId: string | null };

/**
 * Pure: the programme read for one viewer and one filter. `facts` are already
 * the viewer's scope; a training that has not started is not a fact.
 */
export function programmeRead(input: ReadInput, filter: ReadFilter): ProgrammeRead {
  const typeName = new Map(input.types.map((t) => [t.id, t.name]));
  const planTitle = new Map(input.plans.map((p) => [p.id, p.title]));
  const candidates: Candidate[] = [];
  for (const period of PERIODS) {
    const inside = input.facts.filter((f) => inPeriod(f.startsAt, period, input.now));
    const add = (grain: "type" | "plan", id: string, name: string, facts: Fact[]) => {
      const trainings = new Set(facts.map((f) => f.trainingId)).size;
      candidates.push({ grain, id, name, sub: `${trainings} ${trainings === 1 ? "training" : "trainings"}`, period, facts, shown: false, reason: null, beside: null });
    };
    for (const id of new Set(inside.map((f) => f.typeId))) add("type", id, typeName.get(id) ?? "Training", inside.filter((f) => f.typeId === id));
    for (const id of new Set(inside.flatMap((f) => (f.planId ? [f.planId] : [])))) add("plan", id, planTitle.get(id) ?? "A plan", inside.filter((f) => f.planId === id));
  }
  decide(candidates);

  // Rule 2: a narrowing filter that leaves fewer than three reviewers is refused.
  const narrowed = input.facts.filter(
    (f) => inPeriod(f.startsAt, filter.period, input.now) && (!filter.typeId || f.typeId === filter.typeId) && (!filter.planId || f.planId === filter.planId),
  );
  const narrowing = filter.period !== "start" || filter.typeId !== null || filter.planId !== null;
  if (narrowing && !bigEnough(narrowed)) return { refused: true };

  const visible = candidates
    .filter((c) => c.period === filter.period)
    .filter((c) => {
      if (filter.planId) return c.grain === "plan" && c.id === filter.planId;
      if (filter.typeId) return c.grain === "type" ? c.id === filter.typeId : c.facts.some((f) => f.typeId === filter.typeId);
      return true;
    })
    .sort((a, b) => (a.grain === b.grain ? a.name.localeCompare(b.name) : a.grain === "type" ? -1 : 1));
  const slices: Slice[] = visible.map((c) =>
    c.shown ? { grain: c.grain, id: c.id, name: c.name, sub: c.sub, shown: true, figures: figuresOf(c.facts), notes: notesOf(c.facts) } : { grain: c.grain, id: c.id, name: c.name, sub: c.sub, shown: false, reason: c.reason ?? "few", beside: c.beside },
  );
  // The totals add up the shown types only, so they never stand for a hidden one.
  const shownTypes = slices.filter((s): s is Extract<Slice, { shown: true }> => s.shown && s.grain === "type");
  const reviews = shownTypes.reduce((n, s) => n + s.figures.reviews, 0);
  const totals =
    shownTypes.length === 0
      ? null
      : {
          reviews,
          stars: reviews === 0 ? 0 : shownTypes.reduce((n, s) => n + s.figures.stars * s.figures.reviews, 0) / reviews,
          went: shownTypes.reduce((n, s) => n + s.figures.went, 0),
          listed: shownTypes.reduce((n, s) => n + s.figures.listed, 0),
        };
  return { refused: false, slices, totals };
}

/** The reason a hidden slice shows, in the page's words. */
export function hiddenSentence(s: { reason: HiddenReason; beside: string | null }): string {
  if (s.reason === "few") return "Fewer than three people have reviewed it.";
  return `Beside ${s.beside ?? "another slice"}, it would leave fewer than three people's reviews to work out.`;
}

/** Pure: a period from the URL; anything else is since the start. */
export function readPeriod(raw: string | null | undefined): Period {
  return (PERIODS as readonly string[]).includes(raw ?? "") ? (raw as Period) : "start";
}
