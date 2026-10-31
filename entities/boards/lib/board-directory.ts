import { companyOs } from "@/kernel/data/supabase";

// The questions other entities ask about boards, their columns and their
// owners (A.68, ADR 0018). Until A.68 the door handed out `selectBoards`,
// `selectBoardColumns` and `selectBoardMembers`, and each caller chose its own
// columns and spelled "a live board" (active and not archived) or "an open
// column" (neither done nor Not Doing) in its own filters. Each question here
// is the exact query one or more callers built by hand: same table, filters,
// order, limit and single-row form. Where two callers read different columns
// of the same rows, the question selects their union. Where their filters
// differ, they are different questions, so no caller is handed a row it did
// not read before. entities/boards/lib/board-directory.test.ts pins each one.
//
// The selects are literal, so PostgREST types the rows and no caller casts.

const LIVE_BOARD = "active";

/** Every active, unarchived board with its metadata, in board order: the content sync picks its board from these by a metadata flag (campaigns). */
export function activeBoardsWithMetadata() {
  return companyOs.from("boards").select("id, slug, metadata, sort_order").eq("status", LIVE_BOARD).is("archived_at", null).order("sort_order");
}

/** A board by its slug, whatever its status: its id and name (campaigns' audit label, portal's contractor board). */
export function boardOfSlug(slug: string) {
  return companyOs.from("boards").select("id, name").eq("slug", slug).maybeSingle();
}

/** One board, only while it is active and unarchived (coaching's admin-coach pick). */
export function activeBoard(boardId: string) {
  return companyOs.from("boards").select("id, slug, name").eq("id", boardId).eq("status", LIVE_BOARD).is("archived_at", null).maybeSingle();
}

/** The active, unarchived boards among these ids, in board order (coaching's board picker). */
export function activeBoardsAmong(boardIds: string[]) {
  return companyOs.from("boards").select("id, slug, name").in("id", boardIds).eq("status", LIVE_BOARD).is("archived_at", null).order("sort_order");
}

/** These boards by id, whatever their status (coaching's "on the board" note for a pushed commitment). */
export function boardsByIds(boardIds: string[]) {
  return companyOs.from("boards").select("id, slug, name").in("id", boardIds);
}

/** A client company's live boards with their program tag, in board order (crm's company page). */
export function liveBoardsOfCompany(companyId: string) {
  return companyOs
    .from("boards")
    .select("id, name, slug, ai_program_id")
    .eq("client_company_id", companyId)
    .eq("status", LIVE_BOARD)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
}

/**
 * The live boards of the companies the caller has already scoped, in board
 * order (the client portal's hub). The scope is the caller's: the portal
 * passes its actor's `companyScope` and nothing wider.
 */
export function liveBoardsOfCompanies(companyIds: string[]) {
  return companyOs
    .from("boards")
    .select("id, name, slug, ai_program_id")
    .in("client_company_id", companyIds)
    .eq("status", LIVE_BOARD)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
}

/** The program tag of each of a client company's live boards, unordered (the team hub's tab flags). */
export function liveBoardProgramTags(companyId: string) {
  return companyOs.from("boards").select("ai_program_id").eq("client_company_id", companyId).eq("status", LIVE_BOARD).is("archived_at", null);
}

/** One page of the same tags, ordered by id so pages neither repeat nor skip (the team hub's program summary). */
export function liveBoardProgramTagsPage(companyId: string, from: number, to: number) {
  return companyOs
    .from("boards")
    .select("ai_program_id")
    .eq("client_company_id", companyId)
    .eq("status", LIVE_BOARD)
    .is("archived_at", null)
    .order("id")
    .range(from, to);
}

/** A client company's live boards tagged to one of its programs, in board order (the team hub's program page). */
export function liveBoardsOfProgram(companyId: string, programId: string) {
  return companyOs
    .from("boards")
    .select("id, name, slug")
    .eq("client_company_id", companyId)
    .eq("ai_program_id", programId)
    .eq("status", LIVE_BOARD)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
}

/** Every board not archived, whatever its status (the innovation page's client-work count). */
export function unarchivedBoards() {
  return companyOs.from("boards").select("id, name, client_company_id").is("archived_at", null);
}

/** A board's columns with their stage flags, left to right (campaigns' content board, portal's contractor board). */
export function columnsOfBoard(boardId: string) {
  return companyOs.from("board_columns").select("id, name, position, is_done, is_not_doing").eq("board_id", boardId).order("position");
}

/** A board's first open column, neither done nor Not Doing (A.42), or null when it has none. */
export function firstOpenColumn(boardId: string) {
  return companyOs
    .from("board_columns")
    .select("id")
    .eq("board_id", boardId)
    .eq("is_done", false)
    .eq("is_not_doing", false)
    .order("position")
    .limit(1)
    .maybeSingle();
}

/** These columns' names, by id. */
export function columnNames(columnIds: string[]) {
  return companyOs.from("board_columns").select("id, name").in("id", columnIds);
}

/** A board's owner, as rows of at most one (the content sync's assignee). */
export function boardOwner(boardId: string) {
  return companyOs.from("board_members").select("person_id").eq("board_id", boardId).eq("role", "owner").limit(1);
}

/** The ids of the boards a person is a named member of; client assignments are not counted (coaching's board picker). */
export function boardIdsOfMember(personId: string) {
  return companyOs.from("board_members").select("board_id").eq("person_id", personId);
}
