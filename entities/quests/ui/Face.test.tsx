import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Face } from "./Face";
import { FaceBordersContext } from "@/kernel/ui/face-borders";
import { GameStyleContext } from "./game-style";
import { portraitTone } from "./quests-model";

// LD.3 moved the portrait onto the kernel's Avatar. With no border it must be
// the element Quests drew before, byte for byte, so no Quests face changes.
// LD.4 gives each face the border its person wears, from the page's one read.
const who = { personId: "p-1", name: "Sam Rivera", initials: "SR" };
const PLAIN = `<span class="qs-av qs-av--lg qs-tone-${portraitTone("p-1")} qs-av--lit" title="Sam Rivera" aria-label="Sam Rivera" role="img">SR</span>`;

describe("Face", () => {
  it("renders the portrait Quests always drew when no border is worn", () => {
    expect(renderToStaticMarkup(<Face who={who} size="lg" lit />)).toBe(PLAIN);
  });

  it("stays plain when someone else wears a border", () => {
    const out = renderToStaticMarkup(
      <FaceBordersContext.Provider value={{ "p-2": "gold" }}>
        <Face who={who} size="lg" lit />
      </FaceBordersContext.Provider>,
    );
    expect(out).toBe(PLAIN);
  });

  it("wears the person's border round the same portrait", () => {
    const out = renderToStaticMarkup(
      <FaceBordersContext.Provider value={{ "p-1": "gold" }}>
        <Face who={who} />
      </FaceBordersContext.Provider>,
    );
    expect(out).toContain("qs-av qs-av--md");
    expect(out).toContain('class="admin-face-frame frame-gold"');
  });

  it("draws no border once the viewer turns the game style off on the page", () => {
    const out = renderToStaticMarkup(
      <GameStyleContext.Provider value={false}>
        <FaceBordersContext.Provider value={{ "p-1": "gold" }}>
          <Face who={who} size="lg" lit />
        </FaceBordersContext.Provider>
      </GameStyleContext.Provider>,
    );
    expect(out).toBe(PLAIN);
  });
});
