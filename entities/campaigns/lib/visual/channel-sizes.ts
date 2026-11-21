// The image each channel gets: its shape and the exact pixels the kept file
// has. Sizes belong to the platform, not the brand, so they live here in code
// rather than in a table (plan: Campaign images per channel, PR 1; sizes
// revised in Mk.2 of "Campaign images that follow the visual direction skill",
// 18 Nov 2026).
//
// The blog is not in the list: its hero is the same 1200 x 675 picture as the
// email banner, sized by the code-drawn hero itself (hero-shape.ts).

import type { CardFormat } from "./brand-rules";

// The aspect ratios a channel's image may take.
export const IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "4:5", "9:16", "16:9"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export type ImageSize = { aspectRatio: ImageAspectRatio; width: number; height: number };

// LinkedIn takes portrait, the carousel's page size: the tallest shape its feed
// shows uncropped. Facebook and X take square (Marketing, 18 Nov): Facebook's
// default is a set of four, which its feed lays out as a grid of squares, and
// X's is one image that the skill keeps native rather than a shrunk carousel.
// Email is a banner across a 600px column, at 2x for retina.
export const CHANNEL_IMAGE_SIZES = {
  linkedin: { aspectRatio: "4:5", width: 1080, height: 1350 },
  facebook: { aspectRatio: "1:1", width: 1080, height: 1080 },
  twitter: { aspectRatio: "1:1", width: 1200, height: 1200 },
  email: { aspectRatio: "16:9", width: 1200, height: 675 },
} as const satisfies Record<string, ImageSize>;

export type SizedChannel = keyof typeof CHANNEL_IMAGE_SIZES;

// The size for an entry's channel, or null for the blog (whose hero is sized
// by the image router) or an entry with no channel.
export function channelImageSize(channel: string | null | undefined): ImageSize | null {
  if (!channel || !Object.hasOwn(CHANNEL_IMAGE_SIZES, channel)) return null;
  return CHANNEL_IMAGE_SIZES[channel as SizedChannel];
}

// How many images a channel's default set has, and the word rules each image is
// checked under (Mk.2, 18 Nov). LinkedIn's four are one carousel, joined as a
// PDF; Facebook's four are one post's set, so both take the carousel slide's
// caps (up to 8 steps) rather than a single image's (5). Regenerate asks for 4,
// 2 or 1 of them; see slide-roles.ts.
export type ImageCount = 1 | 2 | 4;
export type ImageSet = { images: ImageCount; format: CardFormat };

export const CHANNEL_IMAGE_SETS = {
  blog: { images: 1, format: "single" },
  linkedin: { images: 4, format: "carousel-slide" },
  facebook: { images: 4, format: "carousel-slide" },
  twitter: { images: 1, format: "single" },
  email: { images: 1, format: "single" },
} as const satisfies Record<string, ImageSet>;

export function channelImageSet(channel: string | null | undefined): ImageSet {
  if (!channel || !Object.hasOwn(CHANNEL_IMAGE_SETS, channel)) return { images: 1, format: "single" };
  return CHANNEL_IMAGE_SETS[channel as keyof typeof CHANNEL_IMAGE_SETS];
}
