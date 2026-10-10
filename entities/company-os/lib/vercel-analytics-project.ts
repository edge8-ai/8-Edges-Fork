// Fork overlay: replaces entities/company-os/lib/vercel-analytics-project.ts,
// which names the upstream's own Vercel project. A fork reads its project from
// the environment instead; with either variable unset the Analytics page says
// so and the weekly pulse reports traffic as unavailable.
const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID?.trim();
const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID?.trim();

export const VERCEL_ANALYTICS_PROJECT: { teamId: string; projectId: string } | null =
  teamId && projectId ? { teamId, projectId } : null;
