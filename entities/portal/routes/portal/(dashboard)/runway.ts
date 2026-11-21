// The portal home's runway line: weeks the Human Tokens balance lasts at the
// last four weeks' pace; null when nothing was delivered in that window (no
// pace to project from).
export function runwayLabel(balanceTokens: number, hoursLast28d: number): string | null {
  if (hoursLast28d <= 0 || balanceTokens <= 0) return null;
  const weeks = balanceTokens / (hoursLast28d / 4);
  if (weeks < 1) return "Under a week left at your current pace";
  const n = Math.round(weeks);
  return `About ${n} week${n === 1 ? "" : "s"} left at your current pace`;
}
