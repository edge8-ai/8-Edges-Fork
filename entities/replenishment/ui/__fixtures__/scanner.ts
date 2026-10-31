// Invented jobs for the scanner's tests: no brand, client or real BIN scheme
// (the public fork receives the tests too). Three jobs in walking order, one a
// choice at the shelf and one with no pick BIN yet.
import type { StoredJob } from "../../lib/run-store";

const job = (over: Partial<StoredJob> & Pick<StoredJob, "id" | "position" | "item">): StoredJob => ({
  description: `Kestrel Arlo Black ${over.item}`,
  rule: "Kestrel",
  band: "Sizes 36-42",
  pick: "4",
  reserve: "15",
  move: "12",
  collect: [{ location: "U01", qty: "15" }],
  destinations: ["P01-01"],
  doneAt: null,
  binUsed: null,
  doneBy: null,
  ...over,
});

export const JOBS: StoredJob[] = [
  job({ id: "j1", position: 1, item: "KES-38", collect: [{ location: "U01", qty: "10" }, { location: "U05", qty: "5" }], destinations: ["P03-02", "P04-01", "P07-03"] }),
  job({ id: "j2", position: 2, item: "KES-44", band: "Sizes 43-44", pick: "3", reserve: "10", move: "8 or 10" }),
  job({ id: "j3", position: 3, item: "KES-46", pick: "0", reserve: "7.5", move: "7.5", destinations: [] }),
];

export const done = (j: StoredJob, bin: string): StoredJob => ({ ...j, doneAt: "2026-10-29T02:00:00Z", binUsed: bin, doneBy: "person-7" });

export const WORDS = {
  pick: "Pick face",
  reserve: "Reserve",
  instructions: ["Work the jobs in order.", "Scan the BIN you used."],
  destinationRule: "Start with Destination 1.",
  noPickNote: "No pick BIN yet. Use any BIN in the size zone.",
  choiceHint: "The box decides.",
  footer: "Rules set by the warehouse manager",
};
