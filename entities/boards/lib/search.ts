// Boards' answer to the global search (S.1): cards, by title.
//
// Who finds what follows the Workboard each surface already shows. An admin
// finds any card on a live board. A team member finds cards on the boards
// memberBoardIds gives them, and a team member who is also an admin finds every
// board, exactly as getTeamWorkboard scopes /team/workboard. A card opens in
// its board's drawer through the ?card= link. A subtask has no drawer of its
// own on that link, so it opens its parent's and says whose subtask it is.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { matchEveryTerm } from "@/kernel/data/postgrest-filter";
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
    let scope: string[] | null = null;
    if (actor.surface === "team" && !actor.team.isAdmin) {
      scope = await memberBoardIds(actor.team.personId, actor.team.teamMemberId);
      if (scope.length === 0) return [];
    }

    let query = matchEveryTerm(
      companyOs
        .from("tasks")
        .select("id, title, parent_task_id, parent:tasks!parent_task_id(id, title), boards!inner(slug, name)")
        .is("archived_at", null)
        .is("boards.archived_at", null),
      ["title"],
      terms,
    );
    if (scope) query = query.in("board_id", scope);
    const rows = mustRows(await query.order("created_at", { ascending: false }).limit(limit), "[boards/search] tasks");

    const base = actor.surface === "team" ? "/team" : "/admin";
    return rows.map((t) => {
      const opens = t.parent ?? { id: t.id, title: t.title };
      return {
        id: t.id,
        title: t.title,
        detail: t.parent ? `${t.boards.name} · in ${t.parent.title}` : t.boards.name,
        href: `${base}/boards/${t.boards.slug}?card=${cardSlug(opens.title, opens.id)}`,
      };
    });
  },
};

export const searchContributions: SearchContribution[] = [cards];
