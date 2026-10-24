// The "By AI Program" rows of the client's token usage: one row per program,
// summing every repo it owns (X.1 — a product split into front end and back
// end, or a modular monolith with a repo per component, is still one program
// to the client). Pure, so it can be tested without the tracker, and kept
// apart from hub-tokens.ts, whose fork overlay stubs the tracker queries away.

export type ProgramUsageTotals = {
  programId: string;
  name: string; // the program's name; a repo's only when the program row is missing
  deliveredHours: number;
  aiTokens: number;
  humanHours: number; // the leverage denominator
};

/**
 * A program with a linked repo lists even with no activity yet, so the client
 * sees what is being tracked; a repo with no program is not listed, and neither
 * is a program with no repo. Rows are ordered by program name.
 */
export function sumUsageByProgram(
  repos: Array<{ id: string; name: string; ai_program_id: string | null }>,
  programs: Array<{ id: string; name: string }>,
  perRepo: { hours: Map<string | null, number>; ai: Map<string | null, number>; human: Map<string | null, number> },
): ProgramUsageTotals[] {
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const byProgram = new Map<string, ProgramUsageTotals>();
  for (const repo of repos) {
    if (!repo.ai_program_id) continue;
    const row = byProgram.get(repo.ai_program_id) ?? {
      programId: repo.ai_program_id,
      name: programName.get(repo.ai_program_id) ?? repo.name,
      deliveredHours: 0,
      aiTokens: 0,
      humanHours: 0,
    };
    row.deliveredHours += perRepo.hours.get(repo.id) ?? 0;
    row.aiTokens += perRepo.ai.get(repo.id) ?? 0;
    row.humanHours += perRepo.human.get(repo.id) ?? 0;
    byProgram.set(repo.ai_program_id, row);
  }
  return [...byProgram.values()].sort((a, b) => a.name.localeCompare(b.name));
}
