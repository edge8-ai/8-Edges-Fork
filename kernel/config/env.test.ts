import { afterEach, describe, expect, it, vi } from "vitest";
import { optionalEnv, requireEnv } from "./env";

const NAME = "E8_15_TEST_VARIABLE";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv(NAME, "value");
    expect(requireEnv(NAME)).toBe("value");
  });

  it("throws a message that names the variable when unset", () => {
    vi.stubEnv(NAME, undefined);
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });

  it("treats an empty string as unset", () => {
    vi.stubEnv(NAME, "");
    expect(() => requireEnv(NAME)).toThrow(`${NAME} is not set`);
  });
});

describe("optionalEnv", () => {
  it("returns undefined for unset and empty values", () => {
    vi.stubEnv(NAME, undefined);
    expect(optionalEnv(NAME)).toBeUndefined();
    vi.stubEnv(NAME, "");
    expect(optionalEnv(NAME)).toBeUndefined();
  });

  it("returns the value when set", () => {
    vi.stubEnv(NAME, "x");
    expect(optionalEnv(NAME)).toBe("x");
  });
});
