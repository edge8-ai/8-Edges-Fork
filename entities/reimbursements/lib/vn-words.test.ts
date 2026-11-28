import { describe, expect, it } from "vitest";
import { enWords, vnWords } from "./vn-words";

describe("vnWords", () => {
  const CASES: [number, string][] = [
    [0, "Không đồng"],
    [1, "Một đồng"],
    [5, "Năm đồng"],
    [10, "Mười đồng"],
    [11, "Mười một đồng"],
    [15, "Mười lăm đồng"],
    [20, "Hai mươi đồng"],
    [21, "Hai mươi mốt đồng"],
    [24, "Hai mươi bốn đồng"],
    [25, "Hai mươi lăm đồng"],
    [100, "Một trăm đồng"],
    [101, "Một trăm lẻ một đồng"],
    [105, "Một trăm lẻ năm đồng"],
    [110, "Một trăm mười đồng"],
    [111, "Một trăm mười một đồng"],
    [115, "Một trăm mười lăm đồng"],
    [121, "Một trăm hai mươi mốt đồng"],
    [1_000, "Một nghìn đồng chẵn"],
    [5_000, "Năm nghìn đồng chẵn"],
    [250_000, "Hai trăm năm mươi nghìn đồng chẵn"],
    [640_000, "Sáu trăm bốn mươi nghìn đồng chẵn"],
    [720_000, "Bảy trăm hai mươi nghìn đồng chẵn"],
    [1_000_000, "Một triệu đồng chẵn"],
    [1_005_000, "Một triệu không trăm lẻ năm nghìn đồng chẵn"],
    [1_015_000, "Một triệu không trăm mười lăm nghìn đồng chẵn"],
    [1_050_000, "Một triệu không trăm năm mươi nghìn đồng chẵn"],
    [1_000_500, "Một triệu năm trăm đồng"],
    [1_000_005, "Một triệu không trăm lẻ năm đồng"],
    [7_360_000, "Bảy triệu ba trăm sáu mươi nghìn đồng chẵn"],
    [8_000_000, "Tám triệu đồng chẵn"],
    [8_720_000, "Tám triệu bảy trăm hai mươi nghìn đồng chẵn"],
    [10_000_000, "Mười triệu đồng chẵn"],
    [10_500_250, "Mười triệu năm trăm nghìn hai trăm năm mươi đồng"],
    [1_000_000_000, "Một tỷ đồng chẵn"],
    [2_500_000_000, "Hai tỷ năm trăm triệu đồng chẵn"],
    [1_234_567, "Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng"],
  ];
  for (const [vnd, words] of CASES) {
    it(`${vnd}: ${words}`, () => expect(vnWords(vnd)).toBe(words));
  }

  it("says every amount a person could ask for without an empty word", () => {
    for (let vnd = 0; vnd <= 10_000_000; vnd += 99_999) {
      expect(vnWords(vnd)).not.toMatch(/ {2}|undefined|^ | $/);
    }
  });
});

describe("enWords", () => {
  const CASES: [number, string][] = [
    [0, "Zero Vietnamese dong"],
    [1, "One Vietnamese dong"],
    [19, "Nineteen Vietnamese dong"],
    [21, "Twenty-one Vietnamese dong"],
    [105, "One hundred and five Vietnamese dong"],
    [640_000, "Six hundred and forty thousand Vietnamese dong"],
    [1_000_500, "One million five hundred Vietnamese dong"],
    [8_000_000, "Eight million Vietnamese dong"],
    [8_720_000, "Eight million seven hundred and twenty thousand Vietnamese dong"],
    [10_000_000, "Ten million Vietnamese dong"],
    [2_500_000_000, "Two billion five hundred million Vietnamese dong"],
  ];
  for (const [vnd, words] of CASES) {
    it(`${vnd}: ${words}`, () => expect(enWords(vnd)).toBe(words));
  }
});

describe("an amount the forms cannot say", () => {
  it("is refused, never rounded", () => {
    for (const bad of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => vnWords(bad)).toThrow();
      expect(() => enWords(bad)).toThrow();
    }
  });
});
