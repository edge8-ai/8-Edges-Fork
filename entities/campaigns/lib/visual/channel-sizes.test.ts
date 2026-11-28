import { describe, expect, it } from "vitest";
import { CHANNEL_IMAGE_SETS, CHANNEL_IMAGE_SIZES, IMAGE_ASPECT_RATIOS, channelImageSet, channelImageSize } from "./channel-sizes";

describe("channel image sizes", () => {
  it("gives each social channel its own shape and pixels", () => {
    expect(channelImageSize("linkedin")).toEqual({ aspectRatio: "4:5", width: 1080, height: 1350 });
    expect(channelImageSize("facebook")).toEqual({ aspectRatio: "1:1", width: 1080, height: 1080 });
    expect(channelImageSize("twitter")).toEqual({ aspectRatio: "1:1", width: 1200, height: 1200 });
    expect(channelImageSize("email")).toEqual({ aspectRatio: "16:9", width: 1200, height: 675 });
  });

  it("leaves the blog and unknown channels to the hero shape", () => {
    expect(channelImageSize("blog")).toBeNull();
    expect(channelImageSize(null)).toBeNull();
    expect(channelImageSize("toString")).toBeNull();
  });

  it("asks the model only for ratios it accepts, and the pixels match the ratio", () => {
    for (const [channel, size] of Object.entries(CHANNEL_IMAGE_SIZES)) {
      expect(IMAGE_ASPECT_RATIOS, channel).toContain(size.aspectRatio);
      const [w, h] = size.aspectRatio.split(":").map(Number);
      expect(size.width * h, channel).toBe(size.height * w);
    }
  });
});

describe("channel image sets (Mk.2)", () => {
  it("gives each channel its default number of images", () => {
    expect(channelImageSet("blog")).toEqual({ images: 1, format: "single" });
    expect(channelImageSet("linkedin")).toEqual({ images: 4, format: "carousel-slide" });
    expect(channelImageSet("facebook")).toEqual({ images: 4, format: "carousel-slide" });
    expect(channelImageSet("twitter")).toEqual({ images: 1, format: "single" });
  });

  it("treats an unknown channel as one single image", () => {
    expect(channelImageSet(null)).toEqual({ images: 1, format: "single" });
    expect(channelImageSet("constructor")).toEqual({ images: 1, format: "single" });
  });

  it("checks a set of more than one image under the carousel slide's rules", () => {
    for (const [channel, set] of Object.entries(CHANNEL_IMAGE_SETS)) {
      expect(set.format, channel).toBe(set.images > 1 ? "carousel-slide" : "single");
    }
  });
});
