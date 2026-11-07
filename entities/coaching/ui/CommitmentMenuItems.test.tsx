import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommitmentMenuItems } from "./CommitmentMenuItems";

// What the card's ⋯ menu offers, and to whom.
//
// The rule these pin is not obvious from either component: the two ways a card
// leaves the board are governed by DIFFERENT permissions, because the server
// governs them differently. Deleting a commitment needs authorship
// (myDeleteCommitment refuses anyone else), while archiving is a status change
// and status belongs to whoever owns the profile the card sits on. So a card
// your coach wrote for you can be archived and not deleted — which is the whole
// reason Archive exists, and exactly the distinction a later edit would flatten
// by gating both on the same flag (2026-09-22).

const items = (props: Parameters<typeof CommitmentMenuItems>[0]) =>
  [...renderToStaticMarkup(<CommitmentMenuItems {...props} />).matchAll(/role="menuitem"[^>]*>([^<]*)/g)].map(
    (m) => m[1],
  );

const base = { column: "on_it" as const, busy: false, coachName: null, onMove: () => {} };

describe("the commitment card's ⋯ menu", () => {
  it("offers every move but the one the card is already in", () => {
    expect(items({ ...base, column: "on_it" })).toEqual(["Move to Stuck", "Move to Done"]);
    expect(items({ ...base, column: "done" })).toEqual(["Move to On it", "Move to Stuck"]);
    expect(items({ ...base, column: "blocked" })).toEqual(["Move to On it", "Move to Done"]);
  });

  it("lets a card somebody else wrote be archived, and not deleted", () => {
    const html = renderToStaticMarkup(<CommitmentMenuItems {...base} onArchive={() => {}} />);
    expect(html).toContain("Archive");
    expect(html).not.toContain("Delete");
  });

  it("offers Delete only alongside Archive, for a card the viewer wrote", () => {
    const html = renderToStaticMarkup(
      <CommitmentMenuItems {...base} onArchive={() => {}} onDelete={() => {}} />,
    );
    expect(html).toContain("Archive");
    expect(html).toContain("Delete");
  });

  it("holds no way off the board on the read-only column, where neither is offered", () => {
    const html = renderToStaticMarkup(<CommitmentMenuItems {...base} />);
    expect(html).not.toContain("Archive");
    expect(html).not.toContain("Delete");
    expect(html).not.toContain('role="separator"');
  });
});
