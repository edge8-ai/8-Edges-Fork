import { describe, expect, it } from "vitest";
import { jsonSchemaFor } from "@/kernel/ai/response";
import { cleanThemes, ideaThemesOutput, readStoredThemes, themeLines, themeViews, unthemedCount, type IdeaTheme } from "./themes";

// W.189. The model proposes groupings; these rules decide what the page shows.

const idea = (id: string, person_id: string, kind = "build", created_at = "2026-10-01") => ({
  id,
  person_id,
  kind,
  title: `T-${id}`,
  submitterName: person_id.toUpperCase(),
  created_at,
});
const ideas = [idea("a", "p1"), idea("b", "p2"), idea("c", "p1"), idea("d", "p3"), idea("l1", "p2", "learning"), idea("l2", "p3", "learning")];
const theme = (over: Partial<IdeaTheme> = {}): IdeaTheme => ({
  kind: "build",
  title: "Meetings that turn into work",
  gist: "A call should end with notes and action items.",
  ideaIds: ["a", "b"],
  relatedIds: [],
  repeats: [],
  ...over,
});

describe("cleanThemes", () => {
  it("keeps a theme of two sparks from two people", () => {
    expect(cleanThemes([theme()], ideas)).toEqual([theme()]);
  });

  it("drops ids it was not given and a theme that one person raised alone", () => {
    expect(cleanThemes([theme({ ideaIds: ["a", "c", "zz"] })], ideas)).toEqual([]);
  });

  it("moves a spark of the other kind to related", () => {
    const [t] = cleanThemes([theme({ ideaIds: ["a", "b", "l1"] })], ideas);
    expect(t.ideaIds).toEqual(["a", "b"]);
    expect(t.relatedIds).toEqual(["l1"]);
  });

  it("keeps a repeat only for two of the theme's sparks by different people", () => {
    const [t] = cleanThemes(
      [
        theme({
          ideaIds: ["a", "b", "c"],
          repeats: [
            { ideaIds: ["a", "b"], label: "Home by tenure" },
            { ideaIds: ["a", "c"], label: "Same author" },
            { ideaIds: ["a", "d"], label: "Outside the theme" },
          ],
        }),
      ],
      ideas,
    );
    expect(t.repeats).toEqual([{ ideaIds: ["a", "b"], label: "Home by tenure" }]);
  });

  it("caps each kind at six themes and trims long text", () => {
    const many = Array.from({ length: 8 }, (_, i) => theme({ title: `Theme ${i} ${"x".repeat(90)}` }));
    const out = cleanThemes(many, ideas);
    expect(out).toHaveLength(6);
    expect(out[0].title.length).toBeLessThanOrEqual(70);
    expect(out[0].title.endsWith("…")).toBe(true);
  });
});

describe("readStoredThemes and themeLines", () => {
  it("reads the structured shape and refuses the plain sentences stored before W.189", () => {
    expect(readStoredThemes([theme()])).toEqual([theme()]);
    expect(readStoredThemes(["Three ideas ask for meeting notes."])).toBeNull();
    expect(readStoredThemes(null)).toBeNull();
  });

  it("gives the cockpit one line per theme from either shape", () => {
    expect(themeLines([theme()])).toEqual(["Meetings that turn into work: A call should end with notes and action items."]);
    expect(themeLines(["Three ideas ask for meeting notes.", "", 4])).toEqual(["Three ideas ask for meeting notes."]);
    expect(themeLines(undefined)).toEqual([]);
  });
});

describe("themeViews", () => {
  it("orders themes by how many people raised them and sparks by echoes, then newest", () => {
    const wide = theme({ title: "Wide", ideaIds: ["a", "b", "d"] });
    const narrow = theme({ title: "Narrow", ideaIds: ["a", "b", "c"] });
    const echoes: Record<string, number> = { d: 2 };
    const views = themeViews([narrow, wide], ideas, (id) => echoes[id] ?? 0, (id) => id === "a");
    expect(views.map((v) => v.title)).toEqual(["Wide", "Narrow"]);
    expect(views[0].sparks.map((s) => s.id)).toEqual(["d", "a", "b"]);
    expect(views[0].people.map((p) => p.personId)).toEqual(["p1", "p2", "p3"]);
    expect(views[0].pickedUp).toBe(1);
  });

  it("leaves out a theme whose sparks were archived since the run", () => {
    expect(themeViews([theme({ ideaIds: ["a", "gone"] })], ideas, () => 0, () => false)).toEqual([]);
  });
});

describe("unthemedCount", () => {
  it("counts sparks no theme holds, related ones included as held", () => {
    expect(unthemedCount([theme({ relatedIds: ["l1"] })], ideas)).toBe(3);
  });
});

describe("the schema sent to the model (W.189)", () => {
  it("asks for an object of themes, each with every field required", () => {
    const schema = jsonSchemaFor(ideaThemesOutput) as { required: string[]; properties: { themes: { items: { required: string[] } } } };
    expect(schema.required).toEqual(["themes"]);
    expect([...schema.properties.themes.items.required].sort()).toEqual(["gist", "ideaIds", "kind", "relatedIds", "repeats", "title"]);
  });
});
