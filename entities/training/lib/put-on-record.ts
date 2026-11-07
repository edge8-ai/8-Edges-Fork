// TR.4: a training was put on your record. Every organiser write that puts a
// person on a training ends here, so the Inbox hears it from one place:
// scheduling a one-off training, changing who is on one, a plan's roster,
// publishing a plan, adding a session to it, and opening a plan that was
// closed to its learners.
//
// A plan is one line per person, not one per session: publishing a term of
// twenty sessions would otherwise bury the Inbox, and the person needs to
// know they are on the class, not each date of it. The caller says whether
// the plan is open (learner-visibility), because it already holds the flag;
// a closed plan states nothing, and its learners are told when it opens.
//
// The organiser is never told about themselves. A training a member logs for
// themselves never passes through here (logOwnTraining), nor does a seat a
// person takes by a Raid's fire (taught-sessions), because nobody else put
// them there.
import { publish } from "@/kernel/events";

export type PutOn = { kind: "training"; trainingId: string; startsAt: string } | { kind: "plan"; planId: string };

export async function tellPutOnRecord(organiserId: string, title: string, on: PutOn, personIds: readonly string[]): Promise<void> {
  const people = [...new Set(personIds)].filter((p) => p !== organiserId);
  if (people.length === 0) return;
  await publish("training.people.added", { organiserId, title, on, personIds: people });
}
