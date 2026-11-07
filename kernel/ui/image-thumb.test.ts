import { afterEach, describe, expect, it } from "vitest";
import { thumbSrc } from "./image-thumb";

const OBJECT = "https://example.supabase.co/storage/v1/object/public/avatars/people/p1/photo.jpg";

// TH.24. Faces drawn at 36–56px were loading the uploaded originals, up to
// 1.87 MB each; the resized copy is a few KB. Resizing is a paid Supabase
// feature, so a fork without the switch must get the original URL back.
describe("thumbSrc", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS;
  });

  it("leaves every URL alone while resizing is not switched on", () => {
    expect(thumbSrc(OBJECT, 112)).toBe(OBJECT);
    process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = "yes";
    expect(thumbSrc(OBJECT, 112)).toBe(OBJECT);
  });

  it("asks Storage for a square, cover-cropped copy when it is on", () => {
    process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = "on";
    expect(thumbSrc(OBJECT, 112)).toBe(
      "https://example.supabase.co/storage/v1/render/image/public/avatars/people/p1/photo.jpg?width=112&height=112&resize=cover",
    );
  });

  it("keeps a query the URL already carries and rounds the size", () => {
    process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = " on ";
    expect(thumbSrc(`${OBJECT}?v=3`, 55.6)).toBe(
      "https://example.supabase.co/storage/v1/render/image/public/avatars/people/p1/photo.jpg?v=3&width=56&height=56&resize=cover",
    );
  });

  it("leaves a URL that is not a public Storage object unchanged", () => {
    process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS = "on";
    const google = "https://lh3.googleusercontent.com/a/abc=s96-c";
    expect(thumbSrc(google, 112)).toBe(google);
    expect(thumbSrc("https://example.supabase.co/storage/v1/object/sign/avatars/x.jpg?token=t", 112)).toBe(
      "https://example.supabase.co/storage/v1/object/sign/avatars/x.jpg?token=t",
    );
    expect(thumbSrc("/images/face.png", 112)).toBe("/images/face.png");
    expect(thumbSrc("data:image/png;base64,AAAA", 112)).toBe("data:image/png;base64,AAAA");
  });
});
