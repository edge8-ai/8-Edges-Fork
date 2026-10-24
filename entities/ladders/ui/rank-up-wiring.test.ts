import { describe, expect, it } from "vitest";
import { later, showIt, wireRankUp, type DocLike, type KeyLike, type RankUpActions } from "./rank-up-wiring";

// The rank-up's two answers and its keyboard (LD.5; spec "The rank-up"),
// driven with fakes because the suite has no DOM: Show it wears the tier and
// then marks it shown, Later only marks it shown, Escape is Later, Tab never
// leaves the screen, and closing gives focus back where it was.

const RANK_UP = { markIds: ["u-bronze", "u-iron-never"], ladder: "learn_share" as const };

function fakeActions(wearOk = true) {
  const log: string[] = [];
  const actions: RankUpActions = {
    async setWear(ladder, on) {
      log.push(`setWear ${ladder} ${on}`);
      return wearOk ? { ok: true } : { ok: false, error: "Your choice could not be saved. Try again." };
    },
    async markShown(ids) {
      log.push(`markShown ${ids.join("+")}`);
      return { ok: true };
    },
  };
  return { actions, log };
}

describe("the two answers", () => {
  it("Show it wears the tier on its ladder, then marks the unlock shown", async () => {
    const { actions, log } = fakeActions();
    expect(await showIt(RANK_UP, actions)).toEqual({ ok: true });
    expect(log).toEqual(["setWear learn_share true", "markShown u-bronze+u-iron-never"]);
  });

  it("Show it whose wear fails says so and marks nothing, so the moment is not lost", async () => {
    const { actions, log } = fakeActions(false);
    expect(await showIt(RANK_UP, actions)).toEqual({ ok: false, error: "Your choice could not be saved. Try again." });
    expect(log).toEqual(["setWear learn_share true"]);
  });

  it("Later marks the unlock shown and wears nothing", async () => {
    const { actions, log } = fakeActions();
    expect(await later(RANK_UP, actions)).toEqual({ ok: true });
    expect(log).toEqual(["markShown u-bronze+u-iron-never"]);
  });
});

function fakePage() {
  const listeners = new Set<(e: KeyLike) => void>();
  const page = { name: "the Turn in button", focused: 0, focus() { this.focused += 1; doc.active = this; } };
  const button = (name: string) => ({ name, focus() { doc.active = this; } });
  const show = button("Show it");
  const laterBtn = button("Later");
  const onPage = new Set<unknown>([page, show, laterBtn]);
  const doc: DocLike & { active: unknown; press(key: string, shiftKey?: boolean): boolean } = {
    active: page as unknown,
    get activeElement() {
      return this.active;
    },
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
    contains: (n) => onPage.has(n),
    press(key, shiftKey = false) {
      let prevented = false;
      for (const l of listeners) l({ key, shiftKey, preventDefault: () => (prevented = true) });
      return prevented;
    },
  };
  return { doc, page, show, laterBtn, onPage, listeners };
}

describe("the keyboard", () => {
  it("focuses Show it when the screen opens", () => {
    const { doc, show, laterBtn } = fakePage();
    wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => {} });
    expect(doc.activeElement).toBe(show);
  });

  it("makes Escape Later", () => {
    const { doc, show, laterBtn } = fakePage();
    let laters = 0;
    wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => (laters += 1) });
    expect(doc.press("Escape")).toBe(true);
    expect(laters).toBe(1);
  });

  it("keeps Tab and Shift+Tab inside the screen, round the two answers", () => {
    const { doc, page, show, laterBtn } = fakePage();
    wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => {} });
    expect(doc.press("Tab")).toBe(true);
    expect(doc.activeElement).toBe(laterBtn);
    doc.press("Tab");
    expect(doc.activeElement).toBe(show);
    doc.press("Tab", true);
    expect(doc.activeElement).toBe(laterBtn);
    // Focus dropped on the page behind (a click on the backdrop) comes straight back.
    doc.active = page;
    doc.press("Tab");
    expect(doc.activeElement).toBe(show);
  });

  it("lets every other key through", () => {
    const { doc, show, laterBtn } = fakePage();
    wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => {} });
    expect(doc.press("Enter")).toBe(false);
    expect(doc.activeElement).toBe(show);
  });

  it("gives focus back where it was on close, and stops listening", () => {
    const { doc, page, show, laterBtn, listeners } = fakePage();
    const close = wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => {} });
    close();
    expect(doc.activeElement).toBe(page);
    expect(page.focused).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it("hands focus to nothing a re-render removed", () => {
    const { doc, page, show, laterBtn, onPage } = fakePage();
    const close = wireRankUp({ doc, buttons: () => [show, laterBtn], onLater: () => {} });
    onPage.delete(page);
    close();
    expect(page.focused).toBe(0);
  });
});
