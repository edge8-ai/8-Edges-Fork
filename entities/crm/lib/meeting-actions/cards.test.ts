import { beforeEach, describe, expect, it, vi } from "vitest";

// crm's half of the card filer since ADR 0032 reversed the edge: crm reads its
// waiting actions and hands them to boards with its own writers as the ledger.
const boards = vi.hoisted(() => ({
  fileMeetingActionCards: vi.fn(async () => ({ filed: 1, alreadyFiled: 0, needsBoard: 0, wouldFile: 0, failures: [] })),
  fileMeetingActionCardsOn: vi.fn(async () => ({ ok: true, filed: 1 })),
  boardActorFor: vi.fn(async (): Promise<unknown> => ({ label: "Delivery Lead", personId: "p1", isAdmin: false })),
  DENIED: "You do not have access to this board.",
}));
vi.mock("@/entities/boards", () => boards);
const toFile = vi.hoisted(() => vi.fn(async () => [{ id: "item-1" }]));
vi.mock("./filing", () => ({ meetingActionsToFile: toFile }));
vi.mock("./card-links", () => ({ markMeetingActionFiled: "crm's filed writer", markMeetingActionsNeedBoard: "crm's parking writer" }));
vi.mock("@/kernel/shell/surface", () => ({ revalidateSurfaces: () => undefined }));

const { fileWaitingMeetingActions, fileMeetingItemsOn } = await import("./cards");
const { fileMeetingActionsOnBoard } = await import("./cards-actions");
const LEDGER = { filed: "crm's filed writer", needsBoard: "crm's parking writer" };

beforeEach(() => vi.clearAllMocks());

describe("crm hands its waiting actions to boards' filer (ADR 0032)", () => {
  it("files the tick's live items, at most 50, with crm's own writers as the ledger", async () => {
    await fileWaitingMeetingActions();
    expect(toFile).toHaveBeenCalledWith({ limit: 50 });
    expect(boards.fileMeetingActionCards).toHaveBeenCalledWith([{ id: "item-1" }], LEDGER);
  });

  it("files a person's pick: that meeting's waiting and parked items, on the board they chose", async () => {
    const by = { label: "Delivery Lead", personId: "p1", isAdmin: false };
    await fileMeetingItemsOn("meeting-1", "board-1", by);
    expect(toFile).toHaveBeenCalledWith({ limit: 50, meetingId: "meeting-1", states: ["needs_board", "to_file"] });
    expect(boards.fileMeetingActionCardsOn).toHaveBeenCalledWith([{ id: "item-1" }], "board-1", by, LEDGER);
  });

  it("files the picker's cards in the name of the person boardActorFor answered for", async () => {
    await fileMeetingActionsOnBoard("meeting-1", "board-1");
    expect(boards.fileMeetingActionCardsOn).toHaveBeenCalledWith([{ id: "item-1" }], "board-1", { label: "Delivery Lead", personId: "p1", isAdmin: false }, LEDGER);
  });

  it("refuses the board picker to someone who does not act on the board, and files nothing", async () => {
    boards.boardActorFor.mockResolvedValueOnce(null);
    expect(await fileMeetingActionsOnBoard("meeting-1", "board-1")).toEqual({ ok: false, error: boards.DENIED });
    expect(toFile).not.toHaveBeenCalled();
    expect(boards.fileMeetingActionCardsOn).not.toHaveBeenCalled();
  });
});
