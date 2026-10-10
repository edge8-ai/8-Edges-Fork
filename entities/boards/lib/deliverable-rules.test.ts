import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FILE_TYPES, normaliseFileType, refuseFile, withNormalisedType } from "./deliverable-rules";

// Bug hunt B3 (2026-10-05): browsers name some accepted types their own way,
// or not at all, and the drawer refused them ("Zip it" for a zip). And K3: the
// app's list of accepted types and the bucket's must not drift (B1 was one
// drift), so the bucket's list is read from the migration that made it.

describe("the type a file is held to (B3)", () => {
  it("translates the names browsers give the accepted types", () => {
    expect(normaliseFileType({ name: "b.zip", type: "application/x-zip-compressed" })).toBe("application/zip");
    expect(normaliseFileType({ name: "b.zip", type: "application/x-zip" })).toBe("application/zip");
    expect(normaliseFileType({ name: "p.jpg", type: "image/pjpeg" })).toBe("image/jpeg");
    expect(normaliseFileType({ name: "p.jpg", type: "image/jpg" })).toBe("image/jpeg");
    expect(normaliseFileType({ name: "s.csv", type: "text/x-csv" })).toBe("text/csv");
  });

  it("reads the type from the extension when the browser gives none, or only octet-stream", () => {
    expect(normaliseFileType({ name: "IMG_0412.HEIC", type: "" })).toBe("image/heic");
    expect(normaliseFileType({ name: "shot.heif", type: "" })).toBe("image/heif");
    expect(normaliseFileType({ name: "deck.pptx", type: "application/octet-stream" })).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(normaliseFileType({ name: "clip.mov", type: "" })).toBe("video/quicktime");
  });

  it("reads a .csv that Excel claims as a CSV, and leaves a real .xls alone", () => {
    expect(normaliseFileType({ name: "numbers.csv", type: "application/vnd.ms-excel" })).toBe("text/csv");
    expect(normaliseFileType({ name: "numbers.xls", type: "application/vnd.ms-excel" })).toBe("application/vnd.ms-excel");
  });

  it("keeps a type the browser did name, so an SVG called .png is still refused", () => {
    expect(normaliseFileType({ name: "logo.png", type: "image/svg+xml" })).toBe("image/svg+xml");
    expect(refuseFile({ name: "logo.png", size: 10, type: "image/svg+xml" })).toMatchObject({ reason: "type", detail: expect.stringMatching(/run code/) });
    expect(normaliseFileType({ name: "run.exe", type: "" })).toBe("");
    expect(refuseFile({ name: "run.exe", size: 10, type: "" })).toMatchObject({ reason: "type" });
  });

  it("accepts the zip Windows reports and the HEIC with no type, which were refused", () => {
    expect(refuseFile({ name: "b.zip", size: 10, type: "application/x-zip-compressed" })).toBeNull();
    expect(refuseFile({ name: "IMG_0412.heic", size: 10, type: "" })).toBeNull();
  });

  it("hands on the same file with the type the bucket will check", () => {
    const zip = new File([new Uint8Array([0x50, 0x4b])], "b.zip", { type: "application/x-zip-compressed", lastModified: 1 });
    const fixed = withNormalisedType(zip);
    expect(fixed.type).toBe("application/zip");
    expect(fixed.name).toBe("b.zip");
    expect(fixed.size).toBe(2);
    expect(fixed.lastModified).toBe(1);
    const png = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    expect(withNormalisedType(png)).toBe(png);
  });

  it("only ever normalises to a type the bucket accepts", () => {
    const names = ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.heic", "a.heif", "a.mp4", "a.m4v", "a.webm", "a.mov", "a.pdf", "a.txt", "a.csv", "a.doc", "a.docx", "a.xls", "a.xlsx", "a.ppt", "a.pptx", "a.zip"];
    for (const name of names) expect(FILE_TYPES[normaliseFileType({ name, type: "" })], name).toBeDefined();
  });
});

describe("the app's accepted types and the bucket's (K3)", () => {
  it("are the same list", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261005140000_card_deliverables.sql", import.meta.url), "utf8");
    const insert = /insert into storage\.buckets[\s\S]*?'card-attachments'[\s\S]*?array\[([\s\S]*?)\]/i.exec(sql);
    expect(insert, "the bucket's allowed_mime_types array").not.toBeNull();
    const bucket = [...insert![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(bucket.length).toBeGreaterThan(10);
    expect(Object.keys(FILE_TYPES).sort()).toEqual(bucket);
  });
});
