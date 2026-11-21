import { beforeEach, describe, expect, it, vi } from "vitest";

// SR.1.4. perRender memoises for one request in a server action or a route
// handler too, where React's cache() memoises nothing. The request is the
// cookie store Next hands back: one object per request and phase, so a render
// that follows an action starts afresh. A plain Node run has no cache() (no
// react-server condition), which leaves only the request memo under test.
let store: object | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!store) throw new Error("`cookies` was called outside a request scope");
    return store;
  },
}));

import { perRender } from "./per-render";

beforeEach(() => {
  store = null;
});

describe("perRender", () => {
  it("runs once per request for the same arguments, inside an action as much as a render", async () => {
    const read = vi.fn(async (email: string) => ({ email }));
    const memoised = perRender(read);
    store = {};
    const [a, b] = await Promise.all([memoised("a@x.test"), memoised("a@x.test")]);
    await memoised("a@x.test");
    expect(read).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("keeps one answer per argument list", async () => {
    const read = vi.fn(async (email?: string | null) => email ?? "none");
    const memoised = perRender(read);
    store = {};
    expect(await memoised("a@x.test")).toBe("a@x.test");
    expect(await memoised("b@x.test")).toBe("b@x.test");
    expect(await memoised(null)).toBe("none");
    expect(await memoised(undefined)).toBe("none");
    expect(await memoised("a@x.test")).toBe("a@x.test");
    expect(read).toHaveBeenCalledTimes(4);
  });

  it("asks again in the next request, and in the render that follows an action", async () => {
    const read = vi.fn(async () => "facts");
    const memoised = perRender(read);
    store = {}; // the action's cookie store
    await memoised();
    store = {}; // the render after it, or another request
    await memoised();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("runs bare outside a request, as it did before", async () => {
    const read = vi.fn(async () => "facts");
    const memoised = perRender(read);
    await memoised();
    await memoised();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never memoises a call that passes an object, whose identity is not its value", async () => {
    const read = vi.fn(async (_row: { id: string }) => "facts");
    const memoised = perRender(read);
    store = {};
    await memoised({ id: "1" });
    await memoised({ id: "1" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed read failed for the rest of the request, as cache() does, so a guard never half-answers", async () => {
    const read = vi.fn(async () => {
      throw new Error("db down");
    });
    const memoised = perRender(read);
    store = {};
    await expect(memoised()).rejects.toThrow("db down");
    await expect(memoised()).rejects.toThrow("db down");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps two wrapped functions apart within one request", async () => {
    const one = perRender(vi.fn(async () => "one"));
    const two = perRender(vi.fn(async () => "two"));
    store = {};
    expect([await one(), await two()]).toEqual(["one", "two"]);
  });
});
