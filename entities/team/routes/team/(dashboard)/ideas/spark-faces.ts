import type { SharedIdea } from "@/entities/team/lib/data";
import type { FaceBorders } from "@/kernel/ui/face-borders";
import { joinNames, type SparkSocial } from "@/entities/ideas";
import { formatDate, initials } from "@/kernel/ui/format";
import type { DeckCard } from "./SparkDeck";
import { avatarTone, sparkHook, sparkKind } from "./sparks-model";

// The faces and lines /team/ideas draws from what came back on a spark (ID.2.6,
// ID.2.7). Server-side, so the browser gets names and colours, never the rows.

const FACES = 3;

export type Faces = { faces: { initials: string; tone: number }[]; line: string | null; label: string | null };

// Who admires a spark, as faces and a sentence. Never a number per person: a
// tile says "Quân and Ethan admire this", not "2".
export function admireFaces(social: SparkSocial): Faces {
  const people = social.admirers;
  if (people.length === 0) return { faces: [], line: null, label: null };
  const names = people.map((p) => p.name);
  const line = `${joinNames(names)} ${people.length === 1 ? "admires" : "admire"} this`;
  return {
    faces: people.slice(0, FACES).map((p) => ({ initials: initials(p.name), tone: avatarTone(p.personId) })),
    line,
    label: line,
  };
}

// `borders` is each author's worn tier by person (LD.8), read once by the Spark
// page; Home passes none, and a card whose author wears nothing carries none.
export function deckCard(idea: SharedIdea, social: SparkSocial, borders: FaceBorders = {}): DeckCard {
  const admire = admireFaces(social);
  const border = borders[idea.person_id];
  return {
    ...(border ? { border } : {}),
    id: idea.id,
    kind: sparkKind(idea),
    title: idea.title,
    hook: sparkHook(idea),
    who: idea.submitterName,
    initials: initials(idea.submitterName),
    tone: avatarTone(idea.person_id),
    date: formatDate(idea.created_at),
    faces: admire.faces,
    admireLine: admire.line,
    builds: social.builds,
    checkIn: false,
  };
}
