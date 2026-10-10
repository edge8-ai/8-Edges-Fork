// The Supabase tables the campaigns entity owns (design §4).
export const CAMPAIGNS_TABLES = [
  "book_chapters",
  "books",
  "email_agent_skills",
  "email_agents",
  "email_audiences",
  "email_campaign_recipients",
  "email_campaigns",
  "email_events",
  "email_messages",
  "email_series",
  "marketing_asset_images",
  "marketing_campaigns",
  "marketing_content",
  "marketing_pillars",
  "marketing_recaps",
] as const;
