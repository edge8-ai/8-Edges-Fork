import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { getAccess } from "@/kernel/identity/access-request";

// The signed-in admin's own person row, for the card drawer: "Needs a hand" is
// offered to the card's own assignee, and the handover note is not asked for
// when you hand a card to yourself. An admin session carries an email, not a
// person id, so it is looked up here.
//
// Null is an acceptable answer: no person row, or a failed read, only means
// the drawer treats the admin as somebody other than the assignee. Nothing it
// decides grants or withholds access.
export async function adminViewerPersonId(): Promise<string | null> {
  // Whoever may open the Admin view's Workboard (boards.open), not whoever
  // enters the Admin view (AE.3).
  const access = await getAccess();
  if (!access?.may("boards.open")) return null;
  const res = await companyOs.from("people").select("id").eq("email", access.user.email).is("archived_at", null).limit(1).maybeSingle();
  return (readOr(res, "boards: admin viewer person", null) as { id: string } | null)?.id ?? null;
}
