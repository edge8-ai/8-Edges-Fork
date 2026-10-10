import { describe, expect, it } from "vitest";
import { one } from "./embedded";

describe("one", () => {
  it("returns the first element of an array embed", () => {
    expect(one([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });
  it("returns null for an empty array", () => {
    expect(one([])).toBeNull();
  });
  it("passes a scalar (object) embed through", () => {
    expect(one({ id: 3 })).toEqual({ id: 3 });
  });
  it("returns null for null and undefined", () => {
    expect(one(null)).toBeNull();
    expect(one(undefined)).toBeNull();
  });
});
