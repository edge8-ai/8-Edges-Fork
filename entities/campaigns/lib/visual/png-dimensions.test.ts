import { createElement } from "react";
import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { pngDimensions } from "./png-dimensions";

describe("pngDimensions", () => {
  it("reads a PNG's size from its header", async () => {
    const res = new ImageResponse(createElement("div", { style: { display: "flex", width: "100%", height: "100%", background: "navy" } }), { width: 640, height: 360 });
    expect(pngDimensions(Buffer.from(await res.arrayBuffer()))).toEqual({ width: 640, height: 360 });
  }, 30_000);

  it("reads nothing from bytes that are not a PNG", () => {
    expect(pngDimensions(Buffer.from("png"))).toBeNull();
  });
});
