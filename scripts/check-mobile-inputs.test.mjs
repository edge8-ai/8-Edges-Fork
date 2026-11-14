// Exercises scripts/check-mobile-inputs.mjs against throwaway fixture trees.
//
// Like check-design-ratchet.test.mjs, each test builds a tiny app/ under a temp
// directory rather than pointing at the real repo, so the assertions hold
// however the real stylesheets move; the "real repo passes" check is the
// `check:mobile-inputs` script itself, run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appliesOnSomePhone,
  checkMobileInputs,
  covers,
  evalLength,
  fieldClassesFromTsx,
  inlineSmallFields,
  loadBaseline,
  writeBaseline,
} from "./check-mobile-inputs.mjs";

const tmpDirs = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-inputs-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof source === "string" ? source : JSON.stringify(source));
  }
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const BASELINE = "scripts/mobile-inputs-baseline.json";
// A page that puts `.x-field` on a text input and `.x-tick` on a checkbox.
const PAGE = `export default function P() {
  return <form><input className="x-field" /><input type="checkbox" className="x-tick" /></form>;
}
`;

function tree(css, { baseline = {}, page = PAGE } = {}) {
  const files = { "app/x/page.tsx": page, "app/x/x.css": css };
  if (baseline !== null) files[BASELINE] = baseline;
  return fixture(files);
}

const run = (root) => checkMobileInputs(root);

describe("check-mobile-inputs", () => {
  it("fails a new 13px input rule", () => {
    const { added, stale } = run(tree(`.x-field { font-size: 13px; }\n`));
    expect(stale).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ file: "app/x/x.css", key: ".x-field", line: 1, px: 13 });
  });

  it("passes a 16px input rule", () => {
    expect(run(tree(`.x-field { font-size: 16px; }\ninput { font: 500 1rem/1.4 var(--font); }\n`)).added).toEqual([]);
  });

  it("passes a small rule that only applies above a phone's width", () => {
    const css = `@media (min-width: 769px) { .x-field, textarea { font-size: 13px; } }\n@media (hover: hover) { input { font-size: 12px; } }\n`;
    expect(run(tree(css)).added).toEqual([]);
  });

  it("fails a small rule inside max-width: 880px, and reads the shorthand and tokens", () => {
    const css = `:root { --t-sm: 12px; }\n@media (max-width: 880px) { .wrap select { font-size: var(--t-sm); } }\ntextarea { font: 14px/1.5 serif; }\n`;
    expect(run(tree(css)).added.map((v) => [v.key, v.px])).toEqual([[".wrap select", 12], ["textarea", 14]]);
  });

  it("passes a small rule that a later !important 16px phone rule covers", () => {
    const css = `.page .x-field:focus { font-size: 13px; }\n@media (max-width: 880px) { .x-field, .other input { font-size: 16px !important; } }\n`;
    expect(run(tree(css)).added).toEqual([]);
  });

  it("passes a small rule overridden later in the same file, not by an earlier one", () => {
    expect(run(tree(`.x-field { font-size: 14px; }\n@media (max-width: 768px) { .x-field { font-size: 16px; } }\n`)).added).toEqual([]);
    expect(run(tree(`@media (max-width: 768px) { .x-field { font-size: 16px; } }\n.x-field { font-size: 14px; }\n`)).added).toHaveLength(1);
  });

  it("ignores checkboxes, pseudo-elements and classes no field carries", () => {
    const css = `.x-tick { font-size: 10px; }\ninput[type="checkbox"] { font-size: 10px; }\n.x-field::placeholder { font-size: 12px; }\n.x-label { font-size: 12px; }\n`;
    expect(run(tree(css)).added).toEqual([]);
  });

  it("passes a baselined violation", () => {
    const root = tree(`.x-field { font-size: 13px; }\n`, { baseline: { "app/x/x.css": [".x-field"] } });
    expect(run(root)).toMatchObject({ added: [], stale: [] });
  });

  it("demands the baseline shrink when a baselined violation is fixed", () => {
    const root = tree(`.x-field { font-size: 16px; }\n`, { baseline: { "app/x/x.css": [".x-field"] } });
    expect(run(root).stale).toEqual([{ file: "app/x/x.css", key: ".x-field" }]);
    expect(writeBaseline(root).written).toBe(true);
    expect(loadBaseline(path.join(root, BASELINE))).toEqual({});
    expect(run(root)).toMatchObject({ added: [], stale: [] });
  });

  it("lets a stale entry pass in the public fork, but not a new violation", () => {
    const fork = (css) => {
      const root = tree(css, { baseline: { "app/x/x.css": [".x-field"], "app/gone.css": [".gone-input"] } });
      fs.mkdirSync(path.join(root, "supabase"));
      fs.writeFileSync(path.join(root, "supabase/01-schema.sql"), "");
      return root;
    };
    expect(run(fork(`.x-field { font-size: 13px; }\n`))).toMatchObject({ added: [], stale: [] });
    expect(run(fork(`.x-field { font-size: 13px; }\ntextarea { font-size: 12px; }\n`)).added).toHaveLength(1);
  });

  it("refuses to write a baseline that would grow", () => {
    const root = tree(`.x-field { font-size: 13px; }\ntextarea { font-size: 12px; }\n`, { baseline: { "app/x/x.css": [".x-field"] } });
    const res = writeBaseline(root);
    expect(res.written).toBe(false);
    expect(res.added.map((v) => v.key)).toEqual(["textarea"]);
    expect(loadBaseline(path.join(root, BASELINE))).toEqual({ "app/x/x.css": [".x-field"] });
  });

  it("fails when the baseline is missing", () => {
    expect(run(tree(`.x-field { font-size: 13px; }\n`, { baseline: null })).missing).toBe(true);
  });

  it("flags a literal inline fontSize under 16px on a field tag or field component", () => {
    const page = `export default function P() {
  return <>
    <input style={{ padding: 4, fontSize: 14 }} />
    <PasswordInput inputStyle={{ fontSize: '15px' }} />
    <textarea style={{ fontSize: "16px" }} />
    <p style={{ fontSize: 12 }}>x</p>
  </>;
}
`;
    expect(inlineSmallFields(page).map((v) => [v.tag, v.px, v.line])).toEqual([["input", 14, 3], ["PasswordInput", 15, 4]]);
    const { added } = run(tree(`p { color: red; }\n`, { page }));
    expect(added.map((v) => v.key)).toEqual(["<input> inline style fontSize", "<PasswordInput> inline style fontSize"]);
  });
});

describe("check-mobile-inputs pieces", () => {
  it("collects field classes from literals, expressions and CSS modules", () => {
    const src = `import s from "./a.module.css";
const a = <input className={cx("one", ok && \`two \${x}\`)} />;
const b = <select className={s.pick} />;
const c = <textarea className='three' />;
const d = <input type="radio" className="no" />;
const e = <div className="not-a-field" />;
`;
    expect([...fieldClassesFromTsx(src)].sort()).toEqual(["one", "pick", "three", "two"]);
  });

  it("evaluates lengths at a 375px phone", () => {
    expect(evalLength("0.8125rem")).toBe(13);
    expect(evalLength("clamp(14px, 4vw, 18px)")).toBe(15);
    expect(evalLength("var(--a)", { "--a": "var(--b)", "--b": "12px" })).toBe(12);
    expect(evalLength("0.9em")).toBeNull();
  });

  it("reads media queries against phone widths", () => {
    const media = (prelude) => [{ name: "media", prelude }];
    expect(appliesOnSomePhone(media("(max-width: 880px)"))).toBe(true);
    expect(appliesOnSomePhone(media("screen and (min-width: 769px)"))).toBe(false);
    expect(appliesOnSomePhone(media("(width >= 1024px)"))).toBe(false);
    expect(appliesOnSomePhone(media("(pointer: coarse)"))).toBe(true);
    expect(appliesOnSomePhone(media("print"))).toBe(false);
  });

  it("treats a fix as covering only selectors it is at least as general as", () => {
    expect(covers(".a", ".shell .a:focus")).toBe(true);
    expect(covers("input.a", ".a")).toBe(true);
    expect(covers(".shell .a", ".shell .b .a")).toBe(true);
    expect(covers(".shell .a", ".a")).toBe(false);
    expect(covers('input[type="date"]', "input")).toBe(false);
  });
});
