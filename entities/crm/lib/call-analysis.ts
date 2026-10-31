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
  /** Seconds this speaker held the floor, from the segment timestamps. */
  seconds: number;
  share: number; // 0..1 of the speaking time (of all words when the transcript has no timestamps)
};

export type CallStats = {
  segments: CallSegment[];
  speakers: SpeakerShare[];
  /**
   * The host's share of the speaking time, 0..1; null when the host is not on
   * the call. Time, not words: a fast talker says half again as many words a
   * second as a slow one, so a word share called Dave's 52% of the Vawaa call
   * 59% (2026-10-28). A transcript with no timestamps falls back to words.
   */
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

// "1:02:03.456", "02:03.456" or "2:03" to seconds; null when the shape is off.
export function timeToSeconds(t: string | null): number | null {
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// A segment lasts until the next one starts. The last segment has no
// successor, so it is given the call's average seconds per word, which keeps
// a closing monologue from counting for nothing.
function segmentSeconds(segments: CallSegment[]): number[] {
  const starts = segments.map((s) => timeToSeconds(s.time));
  const out = segments.map((s, i) => {
    const a = starts[i];
    const b = starts[i + 1];
    return a != null && b != null && b >= a ? b - a : null;
  });
  const timed = out.filter((d): d is number => d != null);
  if (timed.length === 0) return out.map(() => 0);
  const timedWords = segments.reduce((n, s, i) => (out[i] != null ? n + countWords(s.text) : n), 0);
  const perWord = timedWords > 0 ? timed.reduce((a, b) => a + b, 0) / timedWords : 0;
  return out.map((d, i) => (d != null ? d : countWords(segments[i].text) * perWord));
}

export function analyzeCall(raw: string): CallStats {
  const segments = parseTranscript(raw);
  const seconds = segmentSeconds(segments);

  const words = new Map<string, number>();
  const time = new Map<string, number>();
  let hostWords = 0;
  let hostSeconds = 0;
  let totalWords = 0;
  let totalSeconds = 0;
  let questionCount = 0;
  segments.forEach((s, i) => {
    const n = countWords(s.text);
    words.set(s.speaker, (words.get(s.speaker) ?? 0) + n);
    time.set(s.speaker, (time.get(s.speaker) ?? 0) + seconds[i]);
    totalWords += n;
    totalSeconds += seconds[i];
    if (HOST_RE.test(s.speaker)) {
      hostWords += n;
      hostSeconds += seconds[i];
      questionCount += countRealQuestions(s.text);
    }
  });

  // Share is of speaking time when the transcript carries timestamps, of
  // words when it does not (a pasted transcript with no clock).
  const byTime = totalSeconds > 0;
  const share = (name: string) =>
    byTime ? (time.get(name) ?? 0) / totalSeconds : totalWords > 0 ? (words.get(name) ?? 0) / totalWords : 0;
  const speakers: SpeakerShare[] = [...words.entries()]
    .map(([name, w]) => ({ name, words: w, seconds: Math.round(time.get(name) ?? 0), share: share(name) }))
    .sort((a, b) => b.share - a.share);

  const hostPresent = speakers.some((s) => HOST_RE.test(s.name));
  const hostShare = byTime ? hostSeconds / totalSeconds : totalWords > 0 ? hostWords / totalWords : null;
  return {
    segments,
    speakers,
    talkRatio: hostPresent ? hostShare : null,
    questionCount,
  };
}

export const isHostSpeaker = (name: string) => HOST_RE.test(name);
