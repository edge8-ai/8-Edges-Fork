import type { TeamActor } from "@/kernel/identity/team-auth";
import { selectTasks } from "@/entities/boards";

// "What moved since last time" drafted from the Workboard (K.20). A member who
// shipped five cards since the last 1-1 should not have to remember them, so
// the form offers their titles as a draft. Titles only, newest first: this is
// never a count and never a score, because a number of cards closed would be a
// figure that describes the person rather than the work. Nothing is stored
// unless the member clicks Use and then Save.

// The board is another entity's data, so the read goes through the boards door
// and the caller keeps its own columns and filters.
const CARD_COLUMNS = "id, title, status, completed_at, assignee_id";

// At most ten, because the draft sits under a textarea and a longer list stops
// being a prompt and becomes a page of its own.
export const MOVED_CARDS_LIMIT = 10;

export type MovedCardRow = {
  id: string;
  title: string | null;
  completed_at: string | null;
};

// Pure so the cut-off rule is testable without a database. `since` is the day
// the last 1-1 was actually held (a Saigon date, "YYYY-MM-DD"); a card counts
// when it was completed on or after that day, compared on the date part
// because completed_at is a timestamp and held_on is a date. With no held 1-1
// yet there is no cut-off and the newest cards stand in for "recently".
export function pickCompletedSince(rows: MovedCardRow[], since: string | null): string[] {
  return rows
    .filter((r) => Boolean(r.title?.trim()))
    .filter((r) => {
      if (!since) return true;
      if (!r.completed_at) return false;
      return r.completed_at.slice(0, 10) >= since;
    })
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
    .slice(0, MOVED_CARDS_LIMIT)
    .map((r) => (r.title as string).trim());
}

export async function getCardsCompletedSince(actor: TeamActor, sinceISO: string | null): Promise<string[]> {
  const { data, error } = await selectTasks(CARD_COLUMNS)
    // tasks.assignee_id is a people.id, which is what the team actor carries.
    .eq("assignee_id", actor.personId)
    .eq("status", "done")
    .is("archived_at", null)
    .order("completed_at", { ascending: false })
    // A generous window before the pure filter narrows it, so a member with a
    // long history still gets the ten that matter.
    .limit(50);
  if (error) {
    console.error("[team/coaching/moved-cards] select", error);
    return [];
  }
  return pickCompletedSince((data ?? []) as unknown as MovedCardRow[], sinceISO);
}
