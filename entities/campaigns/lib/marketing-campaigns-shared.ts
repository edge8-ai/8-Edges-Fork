// The browser-safe half of the campaign umbrella: the status vocabulary the
// campaign hub's filter renders. lib/marketing-campaigns.ts holds the reads and
// imports the service-role client, so the hub taking CAMPAIGN_STATUSES from
// there pulled the data layer into the browser bundle. It imports from here,
// and the server module re-exports so its own callers are unchanged.
export type MarketingCampaignStatus = "draft" | "active" | "paused" | "done" | "archived";

export const CAMPAIGN_STATUSES: { id: MarketingCampaignStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "done", label: "Done" },
  { id: "archived", label: "Archived" },
];
