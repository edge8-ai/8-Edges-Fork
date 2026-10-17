import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardStory } from "./CardStory";
import { DeliverableAddMenu, DeliverableAdds } from "./DeliverableAdds";
import { PendingRow } from "./NewCardDeliverables";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import type { Form } from "./board-view-types";
import type { SubtaskOpener } from "./useSubtaskOpener";

// W.163 U7 and U8. A new card offers the Deliverables section too, holding
// what it is given until Create; and below 640 px File and Link are one
// "+ Add". Rendered statically: the environment has no DOM.

const form = { id: null, title: "", description: "", prUrl: "" } as unknown as Form;
const card = { id: "t1", title: "Saved", subtasks: [], comments: [] } as unknown as WorkboardCard;
// The drawer holds the Subtasks section's state (T6, F12); closed and empty here.
const subtasks: SubtaskOpener = { opened: false, open: () => {}, draft: "", setDraft: () => {} };

function story(f: Partial<Form>, activeCard: WorkboardCard | null, readOnly = false) {
  return renderToStaticMarkup(
    <CardStory form={{ ...form, ...f }} setForm={() => {}} activeCard={activeCard} slug="b" readOnly={readOnly} saving={false} run={() => {}} people={[]} subtasks={subtasks} />,
  );
}

describe("a new card's deliverables (U7)", () => {
  it("draws the section with Choose file, Add a link and the canvas's drop line", () => {
    const out = story({}, null);
    expect(out).toContain('aria-label="Deliverables"');
    expect(out).toContain("Choose file");
    expect(out).toContain("Add a link");
    expect(out).toContain("Drop files here, or paste a screenshot");
    expect(out).toContain("Images, video, PDF, Office files and zip, up to 500 MB each. Seen by the team only.");
  });

  it("offers a picker that names the extensions as well as the types", () => {
    const out = story({}, null);
    expect(out).toMatch(/accept="[^"]*\.heic[^"]*"/);
    expect(out).toMatch(/accept="[^"]*application\/zip[^"]*"/);
  });

  it("is not drawn on a read-only surface", () => {
    expect(story({}, null, true)).not.toContain("Deliverables");
  });

  it("gives a saved card its own list, not the pending one", () => {
    const out = story({ id: "t1" }, card);
    expect(out).toContain('aria-label="Deliverables"');
    expect(out).not.toContain("Drop files here");
    expect(out).toContain("Loading…");
  });

  it("draws a held file and a held link with what happens to them, and a way to take each off", () => {
    const file = renderToStaticMarkup(
      <PendingRow p={{ key: "p1", kind: "file", file: new File([new Uint8Array(2048)], "spec.pdf", { type: "application/pdf" }), source: "chosen" }} onRemove={() => {}} onAddLink={() => {}} />,
    );
    expect(file).toContain(">PDF<");
    expect(file).toContain("spec.pdf");
    expect(file).toContain("Added when you create the card");
    expect(file).toContain('aria-label="Remove spec.pdf"');
    const link = renderToStaticMarkup(<PendingRow p={{ key: "p2", kind: "link", url: "https://loom.com/share/demo-walkthrough" }} onRemove={() => {}} onAddLink={() => {}} />);
    expect(link).toContain("demo walkthrough");
    expect(link).toContain("loom.com");
    expect(link).toContain('aria-label="Remove demo walkthrough"');
  });
});

describe("File and Link on a narrow screen (U8)", () => {
  it("draws both the chips and a single + Add, which the stylesheet chooses between", () => {
    const out = renderToStaticMarkup(<DeliverableAdds onChooseFile={() => {}} onToggleLink={() => {}} linkOpen={false} />);
    expect(out).toContain('class="wb-deliv-adds-wide"');
    expect(out).toContain('class="wb-deliv-adds-narrow"');
    expect(out).toContain("+ Add");
    expect(out).toMatch(/aria-expanded="false"[^>]*>\+ Add/);
  });

  it("opens a list of Photo, video or file, and Link", () => {
    const out = renderToStaticMarkup(<DeliverableAddMenu onChooseFile={() => {}} onLink={() => {}} />);
    expect(out).toContain("Photo, video or file");
    expect(out.indexOf("Photo, video or file")).toBeLessThan(out.indexOf("> Link<"));
  });
});
