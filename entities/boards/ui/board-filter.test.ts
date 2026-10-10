import { describe, expect, it } from "vitest";
import { boardFilterOptions } from "./board-filter";

// What the board filter promises: it appears only where a client in view has
// more than one board (otherwise the client filter already is the board
// filter), it waits for a client to be chosen on a many-client scope, and it
// names the client only when several are in view.

const board = (id: string, client: string | null, name = `Board ${id}`) => ({
  id,
  name,
  client_company_id: client,
  client_name: client ? `Client ${client}` : null,
});

const twoOfA = [board("a1", "A", "Ops"), board("a2", "A", "Site")];
const oneOfB = [board("b1", "B", "Main")];
const internal = [board("i1", null, "Studio"), board("i2", null, "Lab")];

describe("boardFilterOptions", () => {
  it("offers nothing on a many-client scope until a client is chosen", () => {
    expect(boardFilterOptions([...twoOfA, ...oneOfB], [])).toEqual([]);
  });

  it("offers the chosen client's boards by name when that client has several", () => {
    expect(boardFilterOptions([...twoOfA, ...oneOfB], ["A"])).toEqual([
      { value: "a1", label: "Ops" },
      { value: "a2", label: "Site" },
    ]);
  });

  it("offers nothing when every chosen client has one board", () => {
    expect(boardFilterOptions([...twoOfA, ...oneOfB], ["B"])).toEqual([]);
  });

  it("names the client on each option when several clients are in view", () => {
    expect(boardFilterOptions([...twoOfA, ...oneOfB], ["A", "B"])).toEqual([
      { value: "a1", label: "Client A · Ops" },
      { value: "a2", label: "Client A · Site" },
      { value: "b1", label: "Client B · Main" },
    ]);
  });

  it("offers every board straight away on a one-client scope with several boards", () => {
    expect(boardFilterOptions(twoOfA, [])).toEqual([
      { value: "a1", label: "Ops" },
      { value: "a2", label: "Site" },
    ]);
    expect(boardFilterOptions(oneOfB, [])).toEqual([]);
  });

  it("treats boards with no client as one client called Internal", () => {
    expect(boardFilterOptions([...internal, ...oneOfB], ["internal", "B"]).map((o) => o.label)).toEqual([
      "Internal · Studio",
      "Internal · Lab",
      "Client B · Main",
    ]);
  });
});
