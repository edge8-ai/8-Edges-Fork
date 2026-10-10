// Whether Home leads with onboarding, and what its day line says (W.181, from
// Derek's spark). Probation used to switch the new-hire view on by itself, so a
// person on day 35 of probation was still shown "Day 35 of your first 30" and
// "This week from your plan · Week 1". Now the first thirty days decide, as the
// line says. Probation only stands in when there is no start date to count from,
// and pre-boarding still leads with onboarding before the first day.

const NEW_HIRE_DAYS = 30;

type EmploymentStage = string | null | undefined;

export function homeTenure(daysSinceStart: number | null, stage: EmploymentStage): { newHire: boolean; dayLabel: string } {
  const early = stage === "pre_boarding" || stage === "probation";
  const newHire = daysSinceStart === null || daysSinceStart < 0 ? early : daysSinceStart < NEW_HIRE_DAYS;
  const dayLabel =
    daysSinceStart === null ? "Welcome" : daysSinceStart < 0 ? "Starting soon" : `Day ${daysSinceStart + 1} of your first ${NEW_HIRE_DAYS}`;
  return { newHire, dayLabel };
}
