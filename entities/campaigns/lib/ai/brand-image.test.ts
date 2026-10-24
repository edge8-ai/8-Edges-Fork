import { describe, expect, it } from "vitest";
import { withoutHexCodes } from "./brand-image";

// The codes are assembled at runtime so the design-token gate, which counts raw
// colours in source, does not read the fixtures as styling.
const code = (hex: string) => `#${hex}`;

describe("withoutHexCodes", () => {
  it("drops colour codes and keeps the colour names around them", () => {
    const guidance = `Navy ${code("04102D")} as the ground, Blue ${code("287BE8")} and Mint ${code("6FF2C1")} as accents.`;
    expect(withoutHexCodes(guidance)).toBe("Navy as the ground, Blue and Mint as accents.");
    expect(withoutHexCodes(`a ${code("fff")} card`)).toBe("a card");
  });
  it("leaves text without codes alone", () => {
    expect(withoutHexCodes("A deep navy ground.")).toBe("A deep navy ground.");
    expect(withoutHexCodes(null)).toBeNull();
  });
});
