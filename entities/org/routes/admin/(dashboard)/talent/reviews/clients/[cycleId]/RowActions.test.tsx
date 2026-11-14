import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// CR.3.8: the row's More button and its menu. The menu itself opens in the
// browser (it is portalled to the body and placed by measuring the button), so
// what a server render can pin is the closed state: one button that says what
// it opens and for whom, no menu in the page until it is opened, and nothing at
// all for someone who may not manage reviews.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("./owner-actions", () => ({
  changeClientManagerAction: async () => ({ ok: true }),
  reissueLinkAction: async () => ({ ok: true }),
  reopenPartAction: async () => ({ ok: true }),
  unlockPartAction: async () => ({ ok: true }),
  withdrawMemberAction: async () => ({ ok: true }),
}));

import { RowActions, type RowFacts } from "./RowActions";
import { ActionItems } from "./RowActionsItems";
import { hasMenuActions, placeMenu } from "./row-menu";

const row: RowFacts = {
  cycleId: "cycle-1",
  teamMemberId: "tm-1",
  name: "Bình Trần",
  clientManagerPersonId: "p-sami",
  clientManagerName: "Sami Mian",
  clientManagerPartId: "part-1",
  actions: {
    new_link: true,
    unlock: true,
    reopen_member: false,
    reopen_client_manager: false,
    change_client_manager: true,
    withdraw: true,
    edit_summary: false,
    waive_skip: false,
    release: false,
  },
};
const contacts = [{ id: "p-sami", name: "Sami Mian" }];

describe("RowActions", () => {
  it("renders one More button that says it opens a menu for this member, and no menu until opened", () => {
    const html = renderToStaticMarkup(<RowActions may={{ "org.reviews": true }} row={row} contacts={contacts} />);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Actions for Bình Trần"');
    expect(html).toContain(">More<");
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("Withdraw from this cycle");
  });

  it("renders nothing for someone who may not manage reviews", () => {
    expect(renderToStaticMarkup(<RowActions may={{}} row={row} contacts={contacts} />)).toBe("");
  });
});

// What the menu holds is the rules module's answer on the row, and nothing an
// action does runs from the menu itself: each item only hands its question to
// the row (onAsk), which asks it in a dialog.
describe("ActionItems", () => {
  const items = (r: RowFacts, may: Record<string, boolean> = { "org.reviews": true }) =>
    renderToStaticMarkup(<ActionItems may={may} row={r} contacts={contacts} onAsk={() => {}} onChange={() => {}} />);

  it("offers exactly the actions the row allows, each by its full name", () => {
    const html = items(row);
    expect(html).toContain("Cancel link and issue a new one");
    expect(html).toContain("Unlock the client manager&#x27;s part");
    expect(html).toContain("Change client manager…");
    expect(html).toContain("Withdraw from this cycle…");
    expect(html).not.toContain("Reopen");
  });

  it("hides an action the rules do not offer on this row", () => {
    const html = items({ ...row, actions: { ...row.actions, new_link: false, withdraw: false } });
    expect(html).not.toContain("Cancel link and issue a new one");
    expect(html).not.toContain("Withdraw from this cycle");
    expect(html).toContain("Unlock the client manager&#x27;s part");
  });

  it("names the current client manager from the row, even one no longer among the contacts", () => {
    expect(items({ ...row, clientManagerPersonId: "p-gone", clientManagerName: "Archived Person" })).toContain("Now Archived Person.");
    expect(items({ ...row, clientManagerPartId: null, clientManagerPersonId: null, clientManagerName: null })).toContain("Nobody yet.");
  });

  it("is a list of buttons, with no form that could send an action on its own", () => {
    const html = items(row);
    expect(html).not.toContain("<form");
    expect(html.match(/role="menuitem"/g)).toHaveLength(4);
  });

  it("holds nothing for someone who may not manage reviews", () => {
    expect(items(row, {})).toBe("");
  });
});

// More appears only when its menu would hold something: the row's flags also
// carry the member page's actions, which the menu does not offer.
describe("hasMenuActions", () => {
  const none = { ...row.actions, new_link: false, unlock: false, change_client_manager: false, withdraw: false };

  it("is false on a closed cycle, where only the member page's summary is still open", () => {
    expect(hasMenuActions({ ...none, edit_summary: true }, 2)).toBe(false);
  });

  it("is false when the only action is changing the client manager and the client has no contacts", () => {
    expect(hasMenuActions({ ...none, change_client_manager: true }, 0)).toBe(false);
    expect(hasMenuActions({ ...none, change_client_manager: true }, 1)).toBe(true);
  });

  it("is true for any action the menu offers", () => {
    expect(hasMenuActions({ ...none, reopen_member: true }, 0)).toBe(true);
  });
});

// The page's rule for showing More and what the menu renders are two lists kept
// side by side; this holds them equal for every flag, alone, with and without contacts.
describe("More appears exactly when the menu holds something", () => {
  const flags = Object.keys(row.actions) as (keyof RowFacts["actions"])[];
  const allOff = Object.fromEntries(flags.map((f) => [f, false])) as RowFacts["actions"];

  for (const flag of flags) {
    for (const count of [0, 1]) {
      it(`${flag} alone, ${count} contact(s)`, () => {
        const actions = { ...allOff, [flag]: true };
        const shown = contacts.slice(0, count);
        const html = renderToStaticMarkup(
          <ActionItems may={{ "org.reviews": true }} row={{ ...row, actions }} contacts={shown} onAsk={() => {}} onChange={() => {}} />,
        );
        expect(html !== "").toBe(hasMenuActions(actions, count));
      });
    }
  }
});

describe("placeMenu", () => {
  const button = (top: number) => ({ top, bottom: top + 34 });

  it("opens below the button when the menu fits there", () => {
    expect(placeMenu(button(100), 300, 800, 6, 8)).toEqual({ top: 140, maxHeight: null });
  });

  it("opens above the button when only that side has room", () => {
    expect(placeMenu(button(600), 300, 800, 6, 8)).toEqual({ top: 294, maxHeight: null });
  });

  it("takes the roomier side and scrolls when neither side fits (the On Target cycle's middle row)", () => {
    // 431px menu, button at 383-417 in an 800px window: 369px below, 369px above.
    expect(placeMenu({ top: 383, bottom: 417 }, 431, 800, 6, 8)).toEqual({ top: 423, maxHeight: 369 });
    expect(placeMenu(button(500), 600, 800, 6, 8)).toEqual({ top: 8, maxHeight: 486 });
  });
});

