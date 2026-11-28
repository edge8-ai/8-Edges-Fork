// The contract of a member's work signals: when each card they finished and
// each pull request they merged landed, for the personal read on My Training
// (TR.10, spec stories 31, 67 and 68). Each is a slot, boards' in
// entities/boards/slots.ts and htt's in entities/htt/slots.ts, so training
// requires neither. htt is internal, so the type stays in the kernel (ADR 0026):
// a portable page that takes the slot must still compile in the public fork.
// Without the provider the slot is null, and the read says nothing about work.

/** The moments one person's work landed since `since`, oldest first. A failed read raises: no work is not the same as an unread signal. */
export type WorkDatesSlot = ((personId: string, since: string) => Promise<string[]>) | null;
