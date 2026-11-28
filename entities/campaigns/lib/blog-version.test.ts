import { describe, expect, it, vi } from "vitest";
import { contentVersion } from "@/kernel/approvals/version";

// R3.355: a Publish approval's version covers the HTML body ai-officer.com
// renders, hashed only when there is one, so every approval given before the
// HTML joined the version still names the same version for a post without it.

vi.mock("@/kernel/approvals/waiting", () => ({ latestApproval: async () => null }));
const { blogVersion, postVersions } = await import("./blog-version");

const POST = { title: "How to delegate", copyMd: "Body.", seoMd: "slug: how-to-delegate", imageUrl: "https://img.example/1.png", publishDate: "2026-10-09" };

describe("blogVersion", () => {
  it("is the version it was before the HTML body joined it, for a post with no HTML body", () => {
    const before = contentVersion({ title: POST.title, copyMd: POST.copyMd, seoMd: POST.seoMd, imageUrl: POST.imageUrl, publishDate: POST.publishDate });
    expect(blogVersion({ ...POST, bodyHtml: null })).toBe(before);
    expect(blogVersion({ ...POST, bodyHtml: "" })).toBe(before);
  });

  it("changes with the HTML body, and with nothing else when the HTML is the same", () => {
    const html = blogVersion({ ...POST, bodyHtml: "<p>Body.</p>" });
    expect(html).not.toBe(blogVersion({ ...POST, bodyHtml: null }));
    expect(html).not.toBe(blogVersion({ ...POST, bodyHtml: "<p>Body, edited.</p>" }));
    expect(html).toBe(blogVersion({ ...POST, bodyHtml: "<p>Body.</p>" }));
  });

  it("keeps the HTML body in a live post's undated version", () => {
    const live = postVersions({ ...POST, bodyHtml: "<p>Body.</p>", status: "published" });
    expect(live).toEqual([blogVersion({ ...POST, bodyHtml: "<p>Body.</p>" }), blogVersion({ ...POST, bodyHtml: "<p>Body.</p>", publishDate: null })]);
    expect(live).not.toContain(blogVersion({ ...POST, bodyHtml: null, publishDate: null }));
  });
});
