// The Supabase tables the notifications entity owns (S.3). Nobody else writes
// them: the entity fills its own rows by subscribing to the event catalogue,
// which is why it requires no other entity.
export const NOTIFICATIONS_TABLES = [
  "notification_prefs",
  "notification_reads",
  "notifications",
] as const;
