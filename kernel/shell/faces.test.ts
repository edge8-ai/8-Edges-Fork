import { afterEach, describe, expect, it, vi } from "vitest";
import { bordersOf, registerWornTiers, wornTiersFor, type WornFace, type WornTiersProvider } from "./faces";

// The kernel's faces seam (LD.4): empty until the composition root registers
// ladders' provider, one call to the provider per ask, and plain faces rather
// than a broken page when the provider fails. The registry is on globalThis, so
// a registration made in one copy of the module is the one every copy reads.

const KEY = Symbol.for("edge8.shell.worn-tiers");
const VIEWER = { personId: "viewer" };
const gold: WornFace = { learnShare: "gold", builder: null };

afterEach(() => {
  (globalThis as unknown as Record<symbol, unknown>)[KEY] = undefined;
  vi.restoreAllMocks();
});

describe("wornTiersFor", () => {
  it("answers plain faces until a provider is registered", async () => {
    expect(await wornTiersFor(["a", "b"], VIEWER)).toEqual(new Map());
  });

  it("asks the registered provider once, for each person once, on behalf of the viewer", async () => {
    const provider = vi.fn<WornTiersProvider>(async (ids) => new Map(ids.map((id) => [id, gold])));
    registerWornTiers(provider);
    const worn = await wornTiersFor(["a", "b", "a"], VIEWER);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith(["a", "b"], VIEWER);
    expect(worn.get("a")).toEqual(gold);
  });

  it("asks nothing when there is nobody to draw", async () => {
    const provider = vi.fn<WornTiersProvider>(async () => new Map());
    registerWornTiers(provider);
    expect(await wornTiersFor([], VIEWER)).toEqual(new Map());
    expect(provider).not.toHaveBeenCalled();
  });

  it("draws plain faces and says so when the provider fails, rather than failing the page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    registerWornTiers(async () => {
      throw new Error("down");
    });
    expect(await wornTiersFor(["a"], VIEWER)).toEqual(new Map());
    expect(log).toHaveBeenCalledWith("[faces] worn tiers:", "down");
  });

  it("keeps the registration on globalThis, where every copy of the module finds it", async () => {
    registerWornTiers(async () => new Map([["a", gold]]));
    expect((globalThis as unknown as Record<symbol, { provider: unknown }>)[KEY]?.provider).toBeTypeOf("function");
  });
});

describe("bordersOf", () => {
  it("keeps only the people who wear a Learn & Share border, and only the tier", () => {
    const worn = new Map<string, WornFace>([
      ["a", gold],
      ["b", { learnShare: null, builder: "legend" }],
      ["c", { learnShare: null, builder: null }],
    ]);
    expect(bordersOf(worn)).toEqual({ a: "gold" });
  });
});
