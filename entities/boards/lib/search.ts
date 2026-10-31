// Boards' answer to the global search (S.1): cards, by title.
//
// Who finds what follows the Workboard each surface already shows. An admin
// finds any card on a live board. A team member finds cards on the boards
// memberBoardIds gives them, and a team member who is also an admin finds every
// board, exactly as getTeamWorkboard scopes /team/workboard. A card opens in
// its board's drawer through the ?card= link. A subtask has no drawer of its
// own on that link, so it opens its parent's and says whose subtask it is.
//
// The match and the order are the database's (company_os.search_cards,
// SR.2.2): accents ignored, a word start before a match inside a word, a typo
// in a word of four or more letters forgiven, and the best match first, before
// the limit.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { cardSlug } from "@/kernel/config/slug";
import type { SearchContribution } from "@/kernel/shell/search";
import { memberBoardIds } from "./access";

const cards: SearchContribution = {
  kind: "card",
  label: "Cards",
  // The board a hit opens: runSearch asks this only of someone who may open it.
  opens: { admin: "/admin/boards/[slug]", team: "/team/boards/[slug]" },
  async search(actor, terms, limit) {
    // runSearch asks this only on the surfaces listed above, so the actor is an
    // admin or a team member. Offering it to the portal needs its own scope first.
    // null means every live board, and only an admin gets it: the function runs
    // as service_role, so this list is the only thing that keeps a team member
    // to their own boards (db-review of #2203).
    let boardIds: string[] | null = null;
    if (actor.surface === "team" && !actor.team.isAdmin) {
      boardIds = await memberBoardIds(actor.team.personId, actor.team.teamMemberId);
      if (boardIds.length === 0) return [];
    }

    const rows = mustRows(
      // The generated Args type marks board_ids required; the function reads null as every board.
      await companyOs.rpc("search_cards", { terms, board_ids: boardIds as string[], lim: limit }),
      "[boards/search] search_cards",
    );

    const base = actor.surface === "team" ? "/team" : "/admin";
    return rows.map((t) => {
      // The generated Returns type marks the parent present; a top-level card has none.
      const parent = t.parent_id ? { id: t.parent_id, title: t.parent_title } : null;
      const opens = parent ?? { id: t.id, title: t.title };
      return {
        id: t.id,
        title: t.title,
        detail: parent ? `${t.board_name} · in ${parent.title}` : t.board_name,
        href: `${base}/boards/${t.board_slug}?card=${cardSlug(opens.title, opens.id)}`,
      };
    });
  },
};

export const searchContributions: SearchContribution[] = [cards];
