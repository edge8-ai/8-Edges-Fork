import { slugify } from "@/kernel/config/slug";
import { SET_CHANNELS } from "@/entities/campaigns/lib/image-router";
import { channelLabel } from "@/entities/campaigns/lib/marketing-calendar-shared";
import { setSlides, type ImageCard } from "@/entities/campaigns/lib/visual/image-card";

// Ready to post (spec: "Marketing images and publishing", seam 4). LinkedIn,
// Facebook and X are posted by hand, so one press copies the post's text and
// downloads its images in the shape the platform takes: the carousel PDF for a
// LinkedIn set (posted as a document), a zip of PNGs for any other set, the one
// image for a single. This module only decides; the browser fetches and saves
// (ui/ReadyToPostButton.tsx). Pure and free of server imports.

// The post's selected image, as the image library holds it: a set carries its
// slides and the LinkedIn carousel PDF made with them; an image from before
// sets, or a code-drawn hero, is the one picture at its url.
export type ReadyToPostImage = {
  url: string;
  card: ImageCard | null;
};

export type PostBundle =
  | { kind: "none" }
  | { kind: "pdf"; fileName: string; url: string; slides: number }
  | { kind: "zip"; fileName: string; files: { name: string; url: string }[] }
  | { kind: "image"; fileName: string; url: string };

/** Social posts are posted by hand; approved and scheduled ones are waiting on someone to do it. */
export function postedByHand(post: { channel: string; status: string }): boolean {
  return (SET_CHANNELS as readonly string[]).includes(post.channel) && (post.status === "approved" || post.status === "scheduled");
}

/** What Ready to post downloads for this post's selected image. Pure. */
export function readyToPostBundle(post: { title: string; channel: string }, image: ReadyToPostImage | null): PostBundle {
  const slides = setSlides(image?.card);
  const pdfUrl = image?.card?.kind === "set" ? image.card.pdfUrl : null;
  const urls = image ? (slides ? slides.map((s) => s.url) : [image.url]) : [];
  if (urls.length === 0) return { kind: "none" };
  const base = fileBase(post.title, post.channel);
  if (urls.length === 1) return { kind: "image", fileName: `${base}.${extension(urls[0])}`, url: urls[0] };
  // A set made before sets carried their PDF falls through to the zip, so the
  // slides still download together.
  if (post.channel === "linkedin" && pdfUrl) {
    return { kind: "pdf", fileName: `${base}.pdf`, url: pdfUrl, slides: urls.length };
  }
  return { kind: "zip", fileName: `${base}.zip`, files: urls.map((url, i) => ({ name: `${base}-${i + 1}.${extension(url)}`, url })) };
}

/**
 * What the marketer is told after pressing Ready to post. `makeLabel` is the
 * button that makes images on that screen; `markPostedHere` is false where
 * Mark posted is on another screen (the asset page).
 */
export function readyToPostMessage(
  bundle: PostBundle,
  opts: { channel: string; copied: boolean; markPostedHere: boolean; makeLabel: string },
): { tone: "ok" | "warn"; text: string } {
  if (bundle.kind === "none") {
    return { tone: "warn", text: `This post has no images yet. Press ${opts.makeLabel} first, then Ready to post.` };
  }
  const platform = channelLabel(opts.channel);
  const copied = opts.copied ? "Text copied." : "The text could not be copied: select it and copy it by hand.";
  const close = opts.markPostedHere ? "then press Mark posted." : "then mark it posted on the calendar.";
  const what =
    bundle.kind === "pdf"
      ? `Downloading ${bundle.fileName} (${bundle.slides} slides). Paste the text into ${platform}, add the PDF as a document, ${close}`
      : bundle.kind === "zip"
        ? `Downloading ${bundle.fileName} (${bundle.files.length} images). Paste the text into ${platform}, add the images, ${close}`
        : `Downloading ${bundle.fileName}. Paste the text into ${platform}, add the image, ${close}`;
  return { tone: "ok", text: `${copied} ${what}` };
}

// Files are named after the post and its channel, so the marketer finds them
// in Downloads. A title that already names the channel ("Personal LinkedIn:
// ...") is not prefixed twice.
function fileBase(title: string, channel: string): string {
  const name = slugify(channelLabel(channel));
  const slug = slugify(title, 60);
  if (!slug) return `${name}-post`;
  return slug.split("-").includes(name) ? slug : `${name}-${slug}`;
}

// A set's slides are PNGs; an image from before sets keeps the type its url
// names, so the saved file opens as what it is.
function extension(url: string): string {
  const path = url.split(/[?#]/)[0];
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
}
