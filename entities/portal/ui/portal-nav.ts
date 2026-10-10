// What this entity contributes to the client portal's navigation (ADR 0002).
// The shell owns the information architecture (kernel/shell/portal-ia.ts) and
// names the slots; this file names the rows that belong in them. A row with a
// `when` key appears only for a client whose entitlements include it.
import type { NavContribution } from "@/kernel/shell/nav";

export const portalNav: NavContribution[] = [
  { section: null, group: null, order: 10, items: [
    { label: "Home", href: "/portal", ico: "◈", enabled: true },
  ] },
  { section: null, group: "Delivery", order: 20, items: [
    { label: "Requests", href: "/portal/requests", ico: "✎", enabled: true },  // no entitlement key: being a portal member IS the entitlement
  ] },
  { section: null, group: "People", order: 10, items: [
    { label: "Edge8 Team", href: "/portal/team", ico: "☷", enabled: true, when: "team" },  // the staff assigned to the client, not the client's own users
  ] },
  { section: null, group: "Account", order: 10, items: [
    { label: "Personal Profile", href: "/portal/profile", ico: "◉", enabled: true },  // self-scoped, so every role gets it, always
    { label: "Company Profile", href: "/portal/company", ico: "⌂", enabled: true, when: "companyProfile" },  // edits the shared company record: admins only, same gate as Users
    { label: "Tokens", href: "/portal/tokens", ico: "◇", enabled: true, when: "tokens" },
    { label: "Invoices", href: "/portal/invoices", ico: "▤", enabled: true, when: "invoices" },
    { label: "Users", href: "/portal/users", ico: "♟", enabled: true, when: "users" },
    { label: "My Events", href: "/portal/events", ico: "▦", enabled: true },
    { label: "Referrals", href: "/portal/referrals", ico: "%", enabled: true },
  ] },
];
