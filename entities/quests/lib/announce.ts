// How Quests states its facts on the bus (QS.2; the catalogue's quest.* facts,
// kernel/events/catalogue-quests.ts). Every fact is published after the write
// it reports has landed, never before, so a subscriber never hears about a
// summon, a Turn-in, a Reaction or a close that did not happen.
//
// A subscriber's failure never reaches here (the bus logs and audits it). What
// can is the publisher's own mistake: a payload the catalogue refuses, or a
// name that could not be read. That never undoes the write the person made, so
// it comes back as an error line for the caller to log, or for a routine to
// report as a failed step.
import { publish, type EventPayload } from "@/kernel/events";
import type { EventName } from "@/kernel/events/catalogue";
import { peopleOnRecord } from "@/kernel/identity/team-people";

/** Publishes one fact. Null when it was stated, or the reason it could not be. */
export async function announce<N extends EventName>(name: N, payload: EventPayload<N>): Promise<string | null> {
  try {
    await publish(name, payload);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[quests/announce] ${name} not stated:`, message);
    return message;
  }
}

/** A Giver's name for a message, or undefined when it cannot be read: the fact still goes, without it. */
export async function giverName(giverId: string): Promise<string | undefined> {
  try {
    return (await peopleOnRecord([giverId])).get(giverId)?.name || undefined;
  } catch (err) {
    console.error("[quests/announce] giver name", err instanceof Error ? err.message : err);
    return undefined;
  }
}
