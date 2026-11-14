// The columns every write that marks a 1-1 held carries (A.35).
//
// A held 1-1 clears the coach's voltage note: the private line the coach keeps
// before the meeting (K.23, migration 20260917210000) is "cleared the moment
// the meeting is marked held, so nothing about the coach's state outlives the
// hour". Seven paths mark a 1-1 held — the coach's "log it as held", the
// transcript, "mark held", the session-done form, the written recap, the
// nightly Lark pickup and the AI summary — and each built its patch by hand.
// Two forgot the clear, and a held 1-1 kept its coach's note.
//
// So the patch is built here. The caller's own stamps come first and the two
// columns last, so no caller can ask for a held row that keeps its note.
// held-patch.test.ts fails any `status: "held"` write written anywhere else.
// Pure and client-safe.

export function heldPatch<T extends Record<string, unknown>>(stamps: T): Omit<T, "status" | "coach_voltage_md"> & { status: "held"; coach_voltage_md: null } {
  return { ...stamps, status: "held", coach_voltage_md: null };
}
