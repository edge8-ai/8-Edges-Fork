// What a card's Deliverables section receives (W.155): one live, confirmed
// deliverable, file or link, shaped for the drawer. Kept apart from the server
// actions that return it, so a "use client" file can import the type and the
// words without reaching a server module.

export type Deliverable = {
  id: string;
  kind: "file" | "link";
  /** A link's address. Null for a file. */
  url: string | null;
  /** A link's title when one is known. Null for a file. */
  title: string | null;
  /** A file's name as uploaded. Null for a link. */
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /**
   * An image's or a video's own bytes, signed for a while: an image's thumbnail
   * and full-size view, a video's in-card player (W.156). Null for anything
   * else: those are opened through a download link signed when asked for.
   */
  previewUrl: string | null;
  /** Who added it, as people see the name; null when that person is gone. */
  addedBy: string | null;
  createdAt: string;
};

/** "loom.com": the site a link goes to, without the "www.". */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * What a link row is called: its title when one is known, else the last
 * readable part of its path ("share/abc" reads as "abc"), else the site. The
 * site is drawn beside it either way, so the label need not repeat it.
 */
export function linkLabel(d: Pick<Deliverable, "url" | "title">): string {
  if (d.title?.trim()) return d.title.trim();
  if (!d.url) return "Link";
  try {
    const u = new URL(d.url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/[-_]+/g, " ") : linkHost(d.url);
  } catch {
    return d.url;
  }
}
