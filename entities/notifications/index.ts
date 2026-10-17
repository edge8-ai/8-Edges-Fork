// The notifications entity's server door (S.3): the inbox. It subscribes to the
// event catalogue and writes a row for the person each fact matters to, and it
// serves /team/inbox and /admin/inbox. It requires no other entity, so any
// deployment can install it; nobody else ever writes its tables.
export { subscriptions } from "./lib/subscriptions";
export * from "./lib/inbox";
export { NOTIFICATION_KINDS, isNotificationKind, type NotificationKind } from "./lib/kinds";
// Where the admin shell's envelope button leads when this entity is installed
// (app/shell.ts, INBOX_HREF). A deployment without it has no inbox to open.
export const INBOX_HREF = "/admin/inbox";
// The one-line teaser another entity's page may carry (app/shell.ts, InboxLine).
export { InboxLine } from "./ui/InboxLine";
