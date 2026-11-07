// An amount in words, for forms 03-TT and 04-TT (AD.3). The law on accounting wants
// Vietnamese on the document, and another language only beside it, so the forms
// print both. A form's amount is a legal record, so these are exact to the dong: an
// amount they cannot say is refused, never rounded.
//
// Client-safe: no imports.

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function checkedAmount(vnd: number): number {
  if (!Number.isSafeInteger(vnd) || vnd < 0) throw new Error(`An amount in words needs whole, non-negative VND, not ${vnd}.`);
  return vnd;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// One group of three digits. `inner` is a group with a higher group before it,
// which says its empty hundreds aloud: 1,005,000 is "một triệu không trăm lẻ năm nghìn".
function vnGroup(group: number, inner: boolean): string {
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor(group / 10) % 10;
  const ones = group % 10;
  const words: string[] = [];
  if (hundreds > 0 || inner) words.push(`${DIGITS[hundreds]} trăm`);
  if (tens > 1) words.push(`${DIGITS[tens]} mươi`);
  else if (tens === 1) words.push("mười");
  else if (ones > 0 && (hundreds > 0 || inner)) words.push("lẻ");
  if (ones > 0) {
    if (ones === 1 && tens > 1) words.push("mốt");
    else if (ones === 5 && tens > 0) words.push("lăm");
    else words.push(DIGITS[ones]);
  }
  return words.join(" ");
}

const VN_SCALES: [number, string][] = [[1_000_000_000, "tỷ"], [1_000_000, "triệu"], [1_000, "nghìn"], [1, ""]];

/** "Tám triệu đồng chẵn". */
export function vnWords(vnd: number): string {
  let rest = checkedAmount(vnd);
  if (rest === 0) return "Không đồng";
  const words: string[] = [];
  for (const [scale, name] of VN_SCALES) {
    const group = Math.floor(rest / scale);
    rest -= group * scale;
    if (group === 0) continue;
    // The billions may run past three digits, and are read whole.
    const said = group >= 1000 ? vnWords(group).replace(/ đồng( chẵn)?$/, "").toLowerCase() : vnGroup(group, words.length > 0);
    words.push(name ? `${said} ${name}` : said);
  }
  return capitalised(`${words.join(" ")} đồng${vnd % 1000 === 0 ? " chẵn" : ""}`);
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enGroup(group: number): string {
  const hundreds = Math.floor(group / 100);
  const below = group % 100;
  const words: string[] = [];
  if (hundreds > 0) words.push(`${ONES[hundreds]} hundred`);
  if (below > 0) words.push(below < 20 ? ONES[below] : `${TENS[Math.floor(below / 10)]}${below % 10 ? `-${ONES[below % 10]}` : ""}`);
  return words.join(" and ");
}

const EN_SCALES: [number, string][] = [[1_000_000_000_000_000, "quadrillion"], [1_000_000_000_000, "trillion"], [1_000_000_000, "billion"], [1_000_000, "million"], [1_000, "thousand"], [1, ""]];

/** "Eight million Vietnamese dong". */
export function enWords(vnd: number): string {
  let rest = checkedAmount(vnd);
  if (rest === 0) return "Zero Vietnamese dong";
  const words: string[] = [];
  for (const [scale, name] of EN_SCALES) {
    const group = Math.floor(rest / scale);
    rest -= group * scale;
    if (group > 0) words.push(name ? `${enGroup(group)} ${name}` : enGroup(group));
  }
  return capitalised(`${words.join(" ")} Vietnamese dong`);
}
