import { describe, expect, it } from "vitest";
import { resumableEndpoint } from "./upload";

// W.128: large uploads go to the storage host directly, as Supabase asks,
// and to the signed resumable route, which takes a token instead of a session.
describe("the resumable upload endpoint", () => {
  it("uses the direct storage host for a hosted project", () => {
    expect(resumableEndpoint("https://abcd1234.supabase.co")).toBe("https://abcd1234.storage.supabase.co/storage/v1/upload/resumable/sign");
  });

  it("uses any other URL as it is", () => {
    expect(resumableEndpoint("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321/storage/v1/upload/resumable/sign");
  });
});
