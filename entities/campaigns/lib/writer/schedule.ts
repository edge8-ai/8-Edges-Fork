// The decision the daily writer-schedule routine makes, kept pure so it can
// be tested without a database: whether a campaign's start date is close
// enough to draft for.

// A campaign is drafted the day before it starts, or on the day itself if the
// day before was missed. Earlier than that the idea may still be changing;
// later than that the date has passed and a person should decide.
export function startsWithinWindow(startsOn: string | null, today: string): boolean {
  if (!startsOn) return false;
  const start = new Date(`${startsOn}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const days = Math.round((start - now) / 86_400_000);
  return days === 0 || days === 1;
}
