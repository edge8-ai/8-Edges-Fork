import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { effectsSince } from "@/kernel/audit/effects";
import { routineSwitches } from "@/kernel/audit/routine-config";
import { aiTokensByRoutine, recentRunsByRoutine } from "@/kernel/audit/routine-runs";
import { loadAgentManagement } from "@/entities/company-os/lib/agent-management";
import { RUNS_PER_ROUTINE, buildAgentRows, businessWeekStart } from "@/entities/company-os/lib/agent-rows";
import { tokens } from "./RunBits";
import { AgentsBoard } from "./AgentsBoard";

// Settings → Agents (Y.25). Every routine Edge8 runs, on Vercel and on the
// office Mac mini, as what it is doing now rather than how its last run ended:
// running with its deadline, waiting, failed twice, died, off with its reason,
// or a send nobody can vouch for. Each row carries the switch, Run now and its
// details (the last runs, and what it sent this week). A routine that has
// never written a run says so rather than disappearing, so a silent cron is
// visible. The full history of one routine stays on its own page.

const TOKEN_WINDOW_DAYS = 30;

export default async function AgentsPage() {
  // The page's declared permission (ADR 0013); the controls ask for their own.
  const access = await requirePermission("company-os.agents");
  const { routines } = loadAgentManagement();
  const [runs, spend, switches, effects] = await Promise.all([
    recentRunsByRoutine(
      routines.map((r) => r.id),
      RUNS_PER_ROUTINE,
    ),
    aiTokensByRoutine(TOKEN_WINDOW_DAYS),
    routineSwitches(),
    effectsSince(businessWeekStart()),
  ]);
  const rows = buildAgentRows({
    routines,
    runs,
    switches,
    effects,
    tokens: (id) => {
      const t = spend.get(id);
      return t && t.calls > 0 ? `AI ${tokens(t.input + t.output)} tokens, ${TOKEN_WINDOW_DAYS}d` : null;
    },
  });

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Agents"
        sub={`${routines.length} routines on Vercel and the Mac mini. What each is doing now, what it sent, and the switch to stop it.`}
      />
      <AgentsBoard rows={rows} may={mayProp(access, ["company-os.routine-control"])} />
    </>
  );
}
