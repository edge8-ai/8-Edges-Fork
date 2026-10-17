// Deterministic transcript analysis for Sales Intelligence. Everything here is
// computed from the raw text, no AI involved: the AI-judged dimensions live in
// company_os.call_scorecards instead.

export type CallSegment = {
  speaker: string;
  time: string | null;
  text: string;
};

export type SpeakerShare = {
  name: string;
  words: number;
  share: number; // 0..1 of all words
};

export type CallStats = {
  segments: CallSegment[];
  speakers: SpeakerShare[];
  /** The host's share of all words spoken, 0..1; null when the host is not on the call. */
  talkRatio: number | null;
  /** Questions the host asked (sentences of theirs ending in "?"). */
  questionCount: number;
};

import { HOST_RE } from "./call-host";

// Lark transcript format: a speaker line ("Jane Doe 00:00:10.161"), then the
// utterance on the following line(s), separated by blank lines. The file opens
// with a date/duration header and a Keywords block, which never match the
// speaker-line shape and fall through harmlessly.
const SPEAKER_LINE = /^(.{1,60}?)\s+((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)\s*$/;

export function parseTranscript(raw: string): CallSegment[] {
  const segments: CallSegment[] = [];
  let current: CallSegment | null = null;
  for (const line of raw.split("\n")) {
    const m = line.match(SPEAKER_LINE);
    if (m) {
      if (current?.text.trim()) segments.push(current);
      current = { speaker: m[1].trim(), time: m[2], text: "" };
    } else if (current) {
      current.text += (current.text ? "\n" : "") + line.trim();
    }
  }
  if (current?.text.trim()) segments.push(current);
  return segments.map((s) => ({ ...s, text: s.text.trim() }));
}

const countWords = (t: string) => (t.match(/\S+/g) ?? []).length;

// Rhetorical tag questions ("right?", "you know?") are speech tics, not
// discovery. A question counts when the clause ending in "?" does not end in a
// tag word and has some substance to it.
const TAG_WORDS = new Set(["right", "know", "yeah", "yes", "no", "okay", "ok", "correct", "huh", "so"]);

function countRealQuestions(text: string): number {
  let n = 0;
  for (const clause of text.split("?").slice(0, -1)) {
    const words = clause.split(/[.!\n]/).pop()?.match(/[\w']+/g) ?? [];
    const last = words[words.length - 1]?.toLowerCase();
    if (words.length >= 3 && last && !TAG_WORDS.has(last)) n += 1;
  }
  return n;
}

export function analyzeCall(raw: string): CallStats {
  const segments = parseTranscript(raw);

  const words = new Map<string, number>();
  let hostWords = 0;
  let total = 0;
  let questionCount = 0;
  for (const s of segments) {
    const n = countWords(s.text);
    words.set(s.speaker, (words.get(s.speaker) ?? 0) + n);
    total += n;
    if (HOST_RE.test(s.speaker)) {
      hostWords += n;
      questionCount += countRealQuestions(s.text);
    }
  }

  const speakers: SpeakerShare[] = [...words.entries()]
    .map(([name, w]) => ({ name, words: w, share: total > 0 ? w / total : 0 }))
    .sort((a, b) => b.words - a.words);

  const hostPresent = speakers.some((s) => HOST_RE.test(s.name));
  return {
    segments,
    speakers,
    talkRatio: hostPresent && total > 0 ? hostWords / total : null,
    questionCount,
  };
}

export const isHostSpeaker = (name: string) => HOST_RE.test(name);
